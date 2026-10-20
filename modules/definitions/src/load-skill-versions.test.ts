import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startWriter } from '@heynixie/log';
import { createPathSource } from './create-path-source';
import { loadSkillVersions } from './load-skill-versions';
import { runSeed } from './run-seed';

// the writer's data directory holds the definitions root too, so one removal cleans up both
async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-skill-versions-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const root = join(directory, 'definitions');

  const writer = await startWriter({ dataDir: directory });

  stack.defer(() => writer.stop());

  await mkdir(root);

  const deploymentKey = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);

  return {
    root,
    writer,
    log: { writer, deploymentKey, projections: [] },
    source: createPathSource({ directory: root }),
  };
}

test('it reads each seeded skill version by its content hash, with its frontmatter and files', async () => {
  const ctx = await setupTest();

  const skill = '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n';

  await mkdir(join(ctx.root, 'skills', 'tide-tables'), { recursive: true });
  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await writeFile(join(ctx.root, 'skills', 'tide-tables', 'SKILL.md'), skill);

  const seeded = await runSeed({
    log: ctx.log,
    source: ctx.source,
    policy: { rules: [], tools: [] },
  });

  const skillHash = seeded.inForce?.skills.at(0)?.skillHash ?? '';

  const versions = await loadSkillVersions(ctx.writer.db, [skillHash, 'f'.repeat(64)]);

  expect([...versions.values()]).toStrictEqual([
    {
      name: 'tide-tables',
      skillHash,
      frontmatter: {
        name: 'tide-tables',
        description: 'Reads a tide table.',
        license: null,
        compatibility: null,
        allowedTools: null,
        metadata: {},
      },
      files: new Map([['SKILL.md', skill]]),
    },
  ]);
});

test('it reads no versions for no hashes', async () => {
  const ctx = await setupTest();
  const versions = await loadSkillVersions(ctx.writer.db, []);

  expect(versions).toStrictEqual(new Map());
});
