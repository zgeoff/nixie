import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPathSource, readWrittenSkills, runSeed } from '@heynixie/definitions';
import { buildTestTaskSeed } from '@heynixie/definitions/test-utils';
import { readRecords, startWriter, writeRecords } from '@heynixie/log';
import type { RelatedMemoryLookup } from '@heynixie/tools';
import { buildToolRegistry } from '@heynixie/tools';
import { createFakeClock } from '@zgeoff/testing/clock';
import invariant from 'tiny-invariant';
import { buildSkillWriteTool } from './build-skill-write-tool';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-skill-write-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const root = join(directory, 'definitions');

  const writer = await startWriter({ dataDir: directory });

  stack.defer(() => writer.stop());

  await mkdir(join(root, 'skills'), { recursive: true });

  const deploymentKey = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);

  return {
    root,
    log: { writer, deploymentKey, projections: [] },
    source: createPathSource({ directory: root }),
  };
}

test('it proposes a new skill for review and records its files and the run that wrote it', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  const seeded = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  const registry = buildToolRegistry([
    buildSkillWriteTool({
      log: ctx.log,
      clock: createFakeClock({ startMs: 0 }),
      readInForce: () => seeded.inForce,
      runInForceSeed: () => Promise.resolve(),
      refreshDefinitions: () => Promise.resolve(seeded.inForce),
      readSkillList: () => [],
    }),
  ]);

  const tool = registry.findTool('skill_write');

  invariant(tool);

  const outcome = await tool.definition.run(
    {
      callID: 'call-1',
      tool: 'skill_write',
      input: {
        name: 'tide-tables',
        files: [
          {
            path: 'SKILL.md',
            text: '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n',
          },
        ],
      },
      toolUseID: null,
    },
    {
      callSequence: 1,
      run: {
        runID: 'run-1',
        thread: 'conversation',
        logThread: 'conversation',
        tools: [],
        model: { model: 'test-model', profile: 'standard' },
      },
    },
  );

  const proposals = await readRecords(ctx.log, {
    afterSequence: 0,
    kinds: ['skills.write_proposed'],
  });

  invariant(outcome.status === 'ok');

  const proposalID = outcome.result['proposalID'];

  invariant(typeof proposalID === 'string');

  expect(outcome.result).toStrictEqual({
    status: 'pending',
    proposalID,
    message: `pending approval as ${proposalID}`,
  });

  expect(tool.parseOutput(outcome.result)).toStrictEqual({ isValid: true });

  expect(proposals.map((entry) => entry.record)).toMatchObject([
    {
      thread: 'conversation',
      definitions: { snapshotHash: seeded.inForce?.snapshotHash },
      payload: {
        proposalID,
        name: 'tide-tables',
        skillHash: expect.toSatisfy((hash: string) => /^[0-9a-f]{64}$/u.test(hash)),
        baseHash: null,
        files: [
          {
            path: 'SKILL.md',
            text: '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n',
          },
        ],
        untypedToken: null,
        provenance: { runID: 'run-1', callID: 'call-1', profile: 'standard' },
      },
    },
  ]);
});

test('it adds the matching memory to the result of an applied write as related, from the name and the files', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  const seeded = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  const read = mock<(text: string) => Promise<{ shortID: string; text: string }[]>>(() =>
    Promise.resolve([{ shortID: 'k3m9q2xzab', text: 'Tide tables come from the harbour office' }]),
  );

  const tool = buildSkillWriteTool({
    log: ctx.log,
    clock: createFakeClock({ startMs: 0 }),
    readInForce: () => seeded.inForce,
    runInForceSeed: () => Promise.resolve(),
    refreshDefinitions: () => Promise.resolve(seeded.inForce),
    readSkillList: () => [],
    relatedMemory: { read, timeoutMs: 1000, log: mock<RelatedMemoryLookup['log']>() },
  });

  const text = '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n';

  const outcome = await tool.run(
    {
      callID: 'call-1',
      tool: 'skill_write',
      input: { name: 'tide-tables', files: [{ path: 'SKILL.md', text }] },
      toolUseID: null,
    },
    {
      callSequence: 1,
      namingRules: [{ id: 'allow-skill-writes', revision: 3 }],
      run: {
        runID: 'run-1',
        thread: 'conversation',
        logThread: 'conversation',
        tools: [],
        model: { model: 'test-model', profile: 'standard' },
      },
    },
  );

  expect(outcome).toMatchObject({
    status: 'ok',
    result: {
      status: 'applied',
      related: [{ shortID: 'k3m9q2xzab', text: 'Tide tables come from the harbour office' }],
    },
  });

  expect(read.mock.calls).toStrictEqual([[`tide-tables\n${text}`]]);
});

test('it looks nothing up for a write that waits as a proposal', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  const seeded = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  const read = mock<(text: string) => Promise<{ shortID: string; text: string }[]>>(() =>
    Promise.resolve([{ shortID: 'k3m9q2xzab', text: 'Tide tables come from the harbour office' }]),
  );

  const tool = buildSkillWriteTool({
    log: ctx.log,
    clock: createFakeClock({ startMs: 0 }),
    readInForce: () => seeded.inForce,
    runInForceSeed: () => Promise.resolve(),
    refreshDefinitions: () => Promise.resolve(seeded.inForce),
    readSkillList: () => [],
    relatedMemory: { read, timeoutMs: 1000, log: mock<RelatedMemoryLookup['log']>() },
  });

  const text = '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n';

  const outcome = await tool.run(
    {
      callID: 'call-1',
      tool: 'skill_write',
      input: { name: 'tide-tables', files: [{ path: 'SKILL.md', text }] },
      toolUseID: null,
    },
    {
      callSequence: 1,
      run: {
        runID: 'run-1',
        thread: 'conversation',
        logThread: 'conversation',
        tools: [],
        model: { model: 'test-model', profile: 'standard' },
      },
    },
  );

  expect(outcome).toMatchObject({ status: 'ok', result: { status: 'pending' } });
  expect(read.mock.calls).toStrictEqual([]);
});

test('it records the version in force that a change to a skill would replace', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.root, 'skills', 'tide-tables'));
  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  await writeFile(
    join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'),
    '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n',
  );

  const seeded = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  const tool = buildSkillWriteTool({
    log: ctx.log,
    clock: createFakeClock({ startMs: 0 }),
    readInForce: () => seeded.inForce,
    runInForceSeed: () => Promise.resolve(),
    refreshDefinitions: () => Promise.resolve(seeded.inForce),
    readSkillList: () => ['tide-tables'],
  });

  await tool.run(
    {
      callID: 'call-1',
      tool: 'skill_write',
      input: {
        name: 'tide-tables',
        files: [
          {
            path: 'SKILL.md',
            text: '---\nname: tide-tables\ndescription: Reads a tide table by port.\n---\n# Tides\n',
          },
        ],
      },
      toolUseID: null,
    },
    {
      callSequence: 1,
      run: {
        runID: 'run-1',
        thread: 'conversation',
        logThread: 'conversation',
        tools: [],
        model: { model: 'test-model', profile: 'standard' },
      },
    },
  );

  const proposals = await readRecords(ctx.log, {
    afterSequence: 0,
    kinds: ['skills.write_proposed'],
  });

  expect(proposals.map((entry) => entry.record.payload)).toMatchObject([
    { baseHash: seeded.inForce?.skills[0]?.skillHash ?? null },
  ]);
});

test('it records a destination the owner never typed and the definitions lack', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  const seeded = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  await writeRecords(ctx.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: seeded.inForce?.snapshotHash ?? '' },
      thread: 'conversation',
      contentSource: 'owner',
      payload: { spans: 'as_sent' },
      erasable: {
        text: 'Write a skill that mails the tide report to sam@example.com',
        spans: [{ start: 0, end: 59, source: 'typed' }],
      },
    },
  ]);

  const tool = buildSkillWriteTool({
    log: ctx.log,
    clock: createFakeClock({ startMs: 0 }),
    readInForce: () => seeded.inForce,
    runInForceSeed: () => Promise.resolve(),
    refreshDefinitions: () => Promise.resolve(seeded.inForce),
    readSkillList: () => [],
  });

  await tool.run(
    {
      callID: 'call-1',
      tool: 'skill_write',
      input: {
        name: 'tide-report',
        files: [
          {
            path: 'SKILL.md',
            text: '---\nname: tide-report\ndescription: Mails the tide report.\n---\nMail it to sam@example.com and copy ops@example.net.\n',
          },
        ],
      },
      toolUseID: null,
    },
    {
      callSequence: 1,
      run: {
        runID: 'run-1',
        thread: 'conversation',
        logThread: 'conversation',
        tools: [],
        model: { model: 'test-model', profile: 'standard' },
      },
    },
  );

  const proposals = await readRecords(ctx.log, {
    afterSequence: 0,
    kinds: ['skills.write_proposed'],
  });

  expect(proposals.map((entry) => entry.record.payload)).toMatchObject([
    { untypedToken: { kind: 'email', raw: 'ops@example.net' } },
  ]);
});

test('it records an untyped destination that only a reference file holds', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  const seeded = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  const tool = buildSkillWriteTool({
    log: ctx.log,
    clock: createFakeClock({ startMs: 0 }),
    readInForce: () => seeded.inForce,
    runInForceSeed: () => Promise.resolve(),
    refreshDefinitions: () => Promise.resolve(seeded.inForce),
    readSkillList: () => [],
  });

  await tool.run(
    {
      callID: 'call-1',
      tool: 'skill_write',
      input: {
        name: 'tide-report',
        files: [
          {
            path: 'SKILL.md',
            text: '---\nname: tide-report\ndescription: Mails the tide report.\n---\nMail it to the address in references/contacts.md.\n',
          },
          { path: 'references/contacts.md', text: 'Harbour office: ops@example.net\n' },
        ],
      },
      toolUseID: null,
    },
    {
      callSequence: 1,
      run: {
        runID: 'run-1',
        thread: 'conversation',
        logThread: 'conversation',
        tools: [],
        model: { model: 'test-model', profile: 'standard' },
      },
    },
  );

  const proposals = await readRecords(ctx.log, {
    afterSequence: 0,
    kinds: ['skills.write_proposed'],
  });

  expect(proposals.map((entry) => entry.record.payload)).toMatchObject([
    { untypedToken: { kind: 'email', raw: 'ops@example.net' } },
  ]);
});

test('it refuses 2 files at one path, and records no proposal', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  const seeded = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  const tool = buildSkillWriteTool({
    log: ctx.log,
    clock: createFakeClock({ startMs: 0 }),
    readInForce: () => seeded.inForce,
    runInForceSeed: () => Promise.resolve(),
    refreshDefinitions: () => Promise.resolve(seeded.inForce),
    readSkillList: () => [],
  });

  const outcome = await tool.run(
    {
      callID: 'call-1',
      tool: 'skill_write',
      input: {
        name: 'tide-tables',
        files: [
          {
            path: 'SKILL.md',
            text: '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n',
          },
          {
            path: 'SKILL.md',
            text: '---\nname: tide-tables\ndescription: Reads a tide chart.\n---\n# Charts\n',
          },
        ],
      },
      toolUseID: null,
    },
    {
      callSequence: 1,
      run: {
        runID: 'run-1',
        thread: 'conversation',
        logThread: 'conversation',
        tools: [],
        model: { model: 'test-model', profile: 'standard' },
      },
    },
  );

  const proposals = await readRecords(ctx.log, {
    afterSequence: 0,
    kinds: ['skills.write_proposed'],
  });

  expect(outcome).toStrictEqual({
    status: 'error',
    message:
      'the skill fails the seed checks: skills/tide-tables/SKILL.md: the path names a file that an earlier path names',
  });

  expect(proposals).toStrictEqual([]);
});

test('it records no untyped token for a destination that the persona holds', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n\nCopy reports to ops@example.net.\n');

  const seeded = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  const tool = buildSkillWriteTool({
    log: ctx.log,
    clock: createFakeClock({ startMs: 0 }),
    readInForce: () => seeded.inForce,
    runInForceSeed: () => Promise.resolve(),
    refreshDefinitions: () => Promise.resolve(seeded.inForce),
    readSkillList: () => [],
  });

  await tool.run(
    {
      callID: 'call-1',
      tool: 'skill_write',
      input: {
        name: 'tide-report',
        files: [
          {
            path: 'SKILL.md',
            text: '---\nname: tide-report\ndescription: Mails the tide report.\n---\nMail it to ops@example.net.\n',
          },
        ],
      },
      toolUseID: null,
    },
    {
      callSequence: 1,
      run: {
        runID: 'run-1',
        thread: 'conversation',
        logThread: 'conversation',
        tools: [],
        model: { model: 'test-model', profile: 'standard' },
      },
    },
  );

  const proposals = await readRecords(ctx.log, {
    afterSequence: 0,
    kinds: ['skills.write_proposed'],
  });

  expect(proposals.map((entry) => entry.record.payload)).toMatchObject([{ untypedToken: null }]);
});

test('it records no untyped token for a destination that a skill in force holds in its files', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.root, 'skills', 'bird-log', 'references'), { recursive: true });
  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  await writeFile(
    join(ctx.root, 'skills', 'bird-log', 'SKILL.md'),
    '---\nname: bird-log\ndescription: Logs a bird sighting.\n---\n# Birds\n',
  );

  await writeFile(
    join(ctx.root, 'skills', 'bird-log', 'references', 'contacts.md'),
    'Send sightings to ops@example.net.\n',
  );

  const seeded = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  const tool = buildSkillWriteTool({
    log: ctx.log,
    clock: createFakeClock({ startMs: 0 }),
    readInForce: () => seeded.inForce,
    runInForceSeed: () => Promise.resolve(),
    refreshDefinitions: () => Promise.resolve(seeded.inForce),
    readSkillList: () => [],
  });

  await tool.run(
    {
      callID: 'call-1',
      tool: 'skill_write',
      input: {
        name: 'tide-report',
        files: [
          {
            path: 'SKILL.md',
            text: '---\nname: tide-report\ndescription: Mails the tide report.\n---\nMail it to ops@example.net.\n',
          },
        ],
      },
      toolUseID: null,
    },
    {
      callSequence: 1,
      run: {
        runID: 'run-1',
        thread: 'conversation',
        logThread: 'conversation',
        tools: [],
        model: { model: 'test-model', profile: 'standard' },
      },
    },
  );

  const proposals = await readRecords(ctx.log, {
    afterSequence: 0,
    kinds: ['skills.write_proposed'],
  });

  expect(proposals.map((entry) => entry.record.payload)).toMatchObject([{ untypedToken: null }]);
});

test('it refuses a skill that fails a seed check, and records no proposal', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  const seeded = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  const tool = buildSkillWriteTool({
    log: ctx.log,
    clock: createFakeClock({ startMs: 0 }),
    readInForce: () => seeded.inForce,
    runInForceSeed: () => Promise.resolve(),
    refreshDefinitions: () => Promise.resolve(seeded.inForce),
    readSkillList: () => [],
  });

  const outcome = await tool.run(
    {
      callID: 'call-1',
      tool: 'skill_write',
      input: {
        name: 'tide-tables',
        files: [
          {
            path: 'SKILL.md',
            text: `---\nname: tide-tables\ndescription: Reads a tide table.\n---\nRead ${String.fromCodePoint(0x20_2e)}the table\n`,
          },
        ],
      },
      toolUseID: null,
    },
    {
      callSequence: 1,
      run: {
        runID: 'run-1',
        thread: 'conversation',
        logThread: 'conversation',
        tools: [],
        model: { model: 'test-model', profile: 'standard' },
      },
    },
  );

  const proposals = await readRecords(ctx.log, {
    afterSequence: 0,
    kinds: ['skills.write_proposed'],
  });

  expect(outcome).toStrictEqual({
    status: 'error',
    message:
      'the skill fails the seed checks: skills/tide-tables/SKILL.md: line 5 holds U+202E, a hidden or bidirectional control character',
  });

  expect(proposals).toStrictEqual([]);
});

test('it refuses a skill with every problem the seed checks find, and records no proposal', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  const seeded = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  const tool = buildSkillWriteTool({
    log: ctx.log,
    clock: createFakeClock({ startMs: 0 }),
    readInForce: () => seeded.inForce,
    runInForceSeed: () => Promise.resolve(),
    refreshDefinitions: () => Promise.resolve(seeded.inForce),
    readSkillList: () => [],
  });

  const outcome = await tool.run(
    {
      callID: 'call-1',
      tool: 'skill_write',
      input: {
        name: 'tide-tables',
        files: [
          { path: 'SKILL.md', text: '# Tides\n' },
          {
            path: 'references/ports.md',
            text: `Read ${String.fromCodePoint(0x20_2e)}the ports\n`,
          },
        ],
      },
      toolUseID: null,
    },
    {
      callSequence: 1,
      run: {
        runID: 'run-1',
        thread: 'conversation',
        logThread: 'conversation',
        tools: [],
        model: { model: 'test-model', profile: 'standard' },
      },
    },
  );

  const proposals = await readRecords(ctx.log, {
    afterSequence: 0,
    kinds: ['skills.write_proposed'],
  });

  expect(outcome).toStrictEqual({
    status: 'error',
    message:
      'the skill fails the seed checks: skills/tide-tables/SKILL.md: the file does not open with YAML frontmatter between --- lines; skills/tide-tables/references/ports.md: line 1 holds U+202E, a hidden or bidirectional control character',
  });

  expect(proposals).toStrictEqual([]);
});

test('it refuses files that match the version in force', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.root, 'skills', 'tide-tables'));
  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  await writeFile(
    join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'),
    '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n',
  );

  const seeded = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  const tool = buildSkillWriteTool({
    log: ctx.log,
    clock: createFakeClock({ startMs: 0 }),
    readInForce: () => seeded.inForce,
    runInForceSeed: () => Promise.resolve(),
    refreshDefinitions: () => Promise.resolve(seeded.inForce),
    readSkillList: () => ['tide-tables'],
  });

  const outcome = await tool.run(
    {
      callID: 'call-1',
      tool: 'skill_write',
      input: {
        name: 'tide-tables',
        files: [
          {
            path: 'SKILL.md',
            text: '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n',
          },
        ],
      },
      toolUseID: null,
    },
    {
      callSequence: 1,
      run: {
        runID: 'run-1',
        thread: 'conversation',
        logThread: 'conversation',
        tools: [],
        model: { model: 'test-model', profile: 'standard' },
      },
    },
  );

  expect(outcome).toStrictEqual({
    status: 'error',
    message: 'the files match the version of tide-tables in force',
  });
});

test('it refuses a write before the first seed', async () => {
  const ctx = await setupTest();

  const tool = buildSkillWriteTool({
    log: ctx.log,
    clock: createFakeClock({ startMs: 0 }),
    readInForce: () => null,
    runInForceSeed: () => Promise.resolve(),
    refreshDefinitions: () => Promise.resolve(null),
    readSkillList: () => [],
  });

  const outcome = await tool.run(
    {
      callID: 'call-1',
      tool: 'skill_write',
      input: {
        name: 'tide-tables',
        files: [
          {
            path: 'SKILL.md',
            text: '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n',
          },
        ],
      },
      toolUseID: null,
    },
    {
      callSequence: 1,
      run: {
        runID: 'run-1',
        thread: 'conversation',
        logThread: 'conversation',
        tools: [],
        model: { model: 'test-model', profile: 'standard' },
      },
    },
  );

  expect(outcome).toStrictEqual({ status: 'error', message: 'no definitions are in force yet' });
});

test('it applies a skill at once under an allow rule that names skill_write, and records the rule', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  const seeded = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  const seeds: string[] = [];

  const registry = buildToolRegistry([
    buildSkillWriteTool({
      log: ctx.log,
      clock: createFakeClock({ startMs: 1_794_550_000_000 }),
      readInForce: () => seeded.inForce,
      runInForceSeed: () => {
        seeds.push('seed');

        return Promise.resolve();
      },
      refreshDefinitions: () => Promise.resolve(seeded.inForce),
      readSkillList: () => [],
    }),
  ]);

  const tool = registry.findTool('skill_write');

  invariant(tool);

  const outcome = await tool.definition.run(
    {
      callID: 'call-1',
      tool: 'skill_write',
      input: {
        name: 'kite-forecast',
        files: [
          {
            path: 'SKILL.md',
            text: '---\nname: kite-forecast\ndescription: Reads the wind for kites.\n---\n# Wind\n',
          },
        ],
      },
      toolUseID: null,
    },
    {
      callSequence: 1,
      namingRules: [{ id: 'allow-skill-writes', revision: 3 }],
      run: {
        runID: 'run-1',
        thread: 'conversation',
        logThread: 'conversation',
        tools: [],
        model: { model: 'test-model', profile: 'standard' },
      },
    },
  );

  const written = await readWrittenSkills(ctx.log.writer.db);

  const records = await readRecords(ctx.log, {
    afterSequence: 0,
    kinds: ['skills.write_applied', 'skills.write_proposed'],
  });

  const [stored] = written;

  invariant(outcome.status === 'ok');
  invariant(stored, 'the write stored a skill');

  expect(outcome.result).toStrictEqual({
    status: 'applied',
    message:
      'applied kite-forecast under the rule allow-skill-writes; it is in force for new tasks. ' +
      'Call skill_reload with kite-forecast to use it in this conversation.',
  });

  expect(tool.parseOutput(outcome.result)).toStrictEqual({ isValid: true });

  expect(written).toStrictEqual([
    {
      approvalID: expect.any(String),
      proposalID: expect.any(String),
      name: 'kite-forecast',
      skillHash: expect.toSatisfy((hash: string) => /^[0-9a-f]{64}$/u.test(hash)),
      base: null,
      definitions: null,
      approvedAt: 1_794_550_000_000,
    },
  ]);

  expect(
    records.map((entry) => [entry.record.kind, entry.record.thread, entry.record.payload]),
  ).toStrictEqual([
    [
      'skills.write_applied',
      'conversation',
      {
        writeID: stored.proposalID,
        approvalID: stored.approvalID,
        name: 'kite-forecast',
        skillHash: stored.skillHash,
        baseHash: null,
        rule: { id: 'allow-skill-writes', revision: 3 },
        provenance: { runID: 'run-1', callID: 'call-1', profile: 'standard' },
      },
    ],
  ]);

  expect(seeds).toStrictEqual(['seed']);
});

test('it proposes a skill that names a destination the owner never typed, under an allow rule that names skill_write', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  const seeded = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  const tool = buildSkillWriteTool({
    log: ctx.log,
    clock: createFakeClock({ startMs: 0 }),
    readInForce: () => seeded.inForce,
    runInForceSeed: () => Promise.resolve(),
    refreshDefinitions: () => Promise.resolve(seeded.inForce),
    readSkillList: () => [],
  });

  const outcome = await tool.run(
    {
      callID: 'call-1',
      tool: 'skill_write',
      input: {
        name: 'kite-report',
        files: [
          {
            path: 'SKILL.md',
            text: '---\nname: kite-report\ndescription: Mails the kite report.\n---\nMail it to wind@example.net.\n',
          },
        ],
      },
      toolUseID: null,
    },
    {
      callSequence: 1,
      namingRules: [{ id: 'allow-skill-writes', revision: 1 }],
      run: {
        runID: 'run-1',
        thread: 'conversation',
        logThread: 'conversation',
        tools: [],
        model: { model: 'test-model', profile: 'standard' },
      },
    },
  );

  const written = await readWrittenSkills(ctx.log.writer.db);

  invariant(outcome.status === 'ok');

  expect(outcome.result['status']).toBe('pending');
  expect(written).toStrictEqual([]);
});

test('it proposes a skill whose version in force moved since the call read it, under an allow rule that names skill_write', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  const seeded = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  const tool = buildSkillWriteTool({
    log: ctx.log,
    clock: createFakeClock({ startMs: 0 }),
    readInForce: () => seeded.inForce,
    runInForceSeed: () => Promise.resolve(),
    refreshDefinitions: () => Promise.resolve(seeded.inForce),
    readSkillList: () => [],
  });

  const context = {
    callSequence: 1,
    namingRules: [{ id: 'allow-skill-writes', revision: 1 }],
    run: {
      runID: 'run-1',
      thread: 'conversation',
      logThread: 'conversation',
      tools: [],
      model: { model: 'test-model', profile: 'standard' },
    },
  };

  await tool.run(
    {
      callID: 'call-1',
      tool: 'skill_write',
      input: {
        name: 'kite-forecast',
        files: [
          {
            path: 'SKILL.md',
            text: '---\nname: kite-forecast\ndescription: Reads the wind for kites.\n---\n# Wind\n',
          },
        ],
      },
      toolUseID: null,
    },
    context,
  );

  const outcome = await tool.run(
    {
      callID: 'call-2',
      tool: 'skill_write',
      input: {
        name: 'kite-forecast',
        files: [
          {
            path: 'SKILL.md',
            text: '---\nname: kite-forecast\ndescription: Reads the wind and the tide for kites.\n---\n# Wind\n',
          },
        ],
      },
      toolUseID: null,
    },
    context,
  );

  invariant(outcome.status === 'ok');

  expect(outcome.result['status']).toBe('pending');
});

test('it describes a write that a covering rule applies at once, and no approval of each one', async () => {
  const ctx = await setupTest();

  const tool = buildSkillWriteTool({
    log: ctx.log,
    clock: createFakeClock({ startMs: 0 }),
    readInForce: () => null,
    runInForceSeed: () => Promise.resolve(),
    refreshDefinitions: () => Promise.resolve(null),
    readSkillList: () => [],
  });

  expect(tool.description).toInclude('names skill_write, the write applies at once');
  expect(tool.description).not.toInclude('approves each proposal');
});
