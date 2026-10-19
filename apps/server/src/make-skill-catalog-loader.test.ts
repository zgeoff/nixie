import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DefinitionsInForce } from '@heynixie/definitions';
import { createPathSource, runSeed } from '@heynixie/definitions';
import { startWriter } from '@heynixie/log';
import { loadSkillPin } from '@heynixie/skills';
import invariant from 'tiny-invariant';
import { makeSkillCatalogLoader } from './make-skill-catalog-loader';

// the writer's data directory holds the definitions root too, so one removal cleans up both
async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const dir = await mkdtemp(join(tmpdir(), 'nixie-skill-catalog-'));

  stack.defer(() => rm(dir, { recursive: true, force: true }));

  const root = join(dir, 'definitions');

  const writer = await startWriter({ dataDir: dir });

  stack.defer(() => writer.stop());

  await mkdir(join(root, 'skills'), { recursive: true });

  const deploymentKey = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);

  return {
    root,
    log: { writer, deploymentKey, projections: [] },
    source: createPathSource({ dir: root }),
  };
}

test("it renders the catalog of the skills on the conversation's list", async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.root, 'skills', 'tide-tables'));
  await mkdir(join(ctx.root, 'skills', 'bird-log'));
  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\nskills: [tide-tables]\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  await writeFile(
    join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'),
    '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n',
  );

  await writeFile(
    join(ctx.root, 'skills', 'bird-log', 'SKILL.md'),
    '---\nname: bird-log\ndescription: Logs a bird sighting.\n---\n# Birds\n',
  );

  const seeded = await runSeed({
    log: ctx.log,
    source: ctx.source,
    policy: { rules: [], tools: [] },
  });

  const inForce: DefinitionsInForce | null = seeded.inForce;

  const load = makeSkillCatalogLoader({
    log: ctx.log,
    readInForce: () => inForce,
    profile: { model: 'claude-test-1', contextTokens: null },
    skills: { catalogShare: 0.02 },
  });

  const catalog = await load('conversation');

  expect(catalog).toInclude('- tide-tables: Reads a tide table.');
  expect(catalog).not.toInclude('bird-log');
});

test("it caps the catalog at its share of the profile's context window", async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.root, 'skills', 'tide-tables'));
  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  await writeFile(
    join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'),
    '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n',
  );

  const seeded = await runSeed({
    log: ctx.log,
    source: ctx.source,
    policy: { rules: [], tools: [] },
  });

  const inForce: DefinitionsInForce | null = seeded.inForce;

  const load = makeSkillCatalogLoader({
    log: ctx.log,
    readInForce: () => inForce,

    // 2% of a 2,000-token window leaves 40 tokens, which the catalog head alone outgrows
    profile: { model: 'claude-test-1', contextTokens: 2000 },
    skills: { catalogShare: 0.02 },
  });

  const catalog = await load('conversation');

  expect(catalog).toInclude('- More skills, without descriptions: tide-tables');
});

test('it keeps a description that a larger configured share leaves room for', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.root, 'skills', 'tide-tables'));
  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  await writeFile(
    join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'),
    '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n',
  );

  const seeded = await runSeed({
    log: ctx.log,
    source: ctx.source,
    policy: { rules: [], tools: [] },
  });

  const inForce: DefinitionsInForce | null = seeded.inForce;

  const load = makeSkillCatalogLoader({
    log: ctx.log,
    readInForce: () => inForce,

    // 10% of a 2,000-token window leaves 200 tokens, room for the head and the skill's line
    profile: { model: 'claude-test-1', contextTokens: 2000 },
    skills: { catalogShare: 0.1 },
  });

  const catalog = await load('conversation');

  expect(catalog).toInclude('- tide-tables: Reads a tide table.');
});

test("it caps the catalog at its share of the CLI's window for a profile with no window of its own", async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.root, 'skills', 'tide-tables'));
  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  await writeFile(
    join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'),
    '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n',
  );

  const seeded = await runSeed({
    log: ctx.log,
    source: ctx.source,
    policy: { rules: [], tools: [] },
  });

  const inForce: DefinitionsInForce | null = seeded.inForce;

  const load = makeSkillCatalogLoader({
    log: ctx.log,
    readInForce: () => inForce,

    // 0.02% of the CLI's 200,000-token window for the model leaves 40 tokens, too few for a line
    profile: { model: 'claude-test-1', contextTokens: null },
    skills: { catalogShare: 0.0002 },
  });

  const catalog = await load('conversation');

  expect(catalog).toInclude('- More skills, without descriptions: tide-tables');
});

test("it keeps a description that the CLI's million-token window leaves room for", async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.root, 'skills', 'tide-tables'));
  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  await writeFile(
    join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'),
    '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n',
  );

  const seeded = await runSeed({
    log: ctx.log,
    source: ctx.source,
    policy: { rules: [], tools: [] },
  });

  const inForce: DefinitionsInForce | null = seeded.inForce;

  const load = makeSkillCatalogLoader({
    log: ctx.log,
    readInForce: () => inForce,

    // 0.02% of the CLI's 1,000,000-token window for a [1m] model leaves 200 tokens
    profile: { model: 'claude-test-1[1m]', contextTokens: null },
    skills: { catalogShare: 0.0002 },
  });

  const catalog = await load('conversation');

  expect(catalog).toInclude('- tide-tables: Reads a tide table.');
});

test("it pins the task to the conversation's list on its first load", async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.root, 'skills', 'tide-tables'));
  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\nskills: [tide-tables]\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  await writeFile(
    join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'),
    '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n',
  );

  const seeded = await runSeed({
    log: ctx.log,
    source: ctx.source,
    policy: { rules: [], tools: [] },
  });

  const inForce: DefinitionsInForce | null = seeded.inForce;

  const load = makeSkillCatalogLoader({
    log: ctx.log,
    readInForce: () => inForce,
    profile: { model: 'claude-test-1', contextTokens: null },
    skills: { catalogShare: 0.02 },
  });

  await load('conversation');

  const pin = await loadSkillPin(ctx.log, 'conversation');

  invariant(inForce !== null);

  expect(pin).toStrictEqual(inForce.skills.filter((skill) => skill.name === 'tide-tables'));
});

test('it renders no catalog before the first seed', async () => {
  const ctx = await setupTest();

  const load = makeSkillCatalogLoader({
    log: ctx.log,
    readInForce: () => null,
    profile: { model: 'claude-test-1', contextTokens: null },
    skills: { catalogShare: 0.02 },
  });

  const catalog = await load('conversation');

  expect(catalog).toBeNull();
});
