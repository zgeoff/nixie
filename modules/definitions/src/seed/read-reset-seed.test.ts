import { expect, test } from 'bun:test';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import invariant from 'tiny-invariant';
import { buildDefinitionsSnapshot } from '../definition/build-definitions-snapshot';
import { runSeed } from '../rule/run-seed';
import { requestDefinitionChange } from '../runtime-task/request-definition-change';
import { buildTestDefineInput } from '../test-utils/build-test-define-input';
import { buildTestTaskSeed } from '../test-utils/build-test-task-seed';
import { buildTestTaskYaml } from '../test-utils/build-test-task-yaml';
import { startTestDefinitions } from '../test-utils/start-test-definitions';
import { readResetSeed } from './read-reset-seed';

function setupTest() {
  return startTestDefinitions();
}

test('it finds nothing before the first seed', async () => {
  const ctx = await setupTest();
  const seed = await readResetSeed(ctx.writer.db, 0);

  expect(seed).toBeNull();
});

test('it reads the seed in force with its snapshot row and the payload of its record', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n\nCalm and short.\n');

  const policy = { rules: [{ id: 'allow-reads' }], tools: [] };

  const seeded = await runSeed({
    tasks: buildTestTaskSeed(),
    log: ctx.log,
    source: ctx.source,
    buildPolicy: () => policy,
  });

  const built = buildDefinitionsSnapshot({
    skills: [],
    conversationSkills: [],
    tasks: [],
    persona: '# Persona\n\nCalm and short.\n',
    prompts: {},
    policy,
  });

  const seed = await readResetSeed(ctx.writer.db, 0);

  invariant(seeded.inForce);

  expect(seed).toStrictEqual({
    inForce: seeded.inForce,
    policyHash: built.policyHash,
    form: built.form,
    label: seeded.inForce.revision,
    createdAt: seeded.inForce.seededAt.getTime(),
    payload: {
      sourceID: `path:${ctx.root}`,
      sourceKind: 'path',
      sourceRepository: null,
      revision: seeded.inForce.revision,
      contentHash: seeded.inForce.contentHash,
      formatVersion: 2,
      policyHash: built.policyHash,
      skills: [],
      skillChanges: { added: [], changed: [], removed: [] },
      writtenSkills: [],
      adoptedSkills: [],
      effects: {},
      heldEffects: [],
      repoTasks: [],
      unapplied: [],
      skipped: [],
      rules: { revisions: [], applied: [], held: [], adopted: [], conflicts: [], proposalID: null },
    },
    skills: [],
    written: [],
    beneath: [],
    rules: [],
    closedProposalHashes: [],
    taskVersions: [],
  });
});

test('it covers the repo version and the runtime version of a replaced definition', async () => {
  const ctx = await setupTest();

  await ctx.writeRepoTask('water-the-tomatoes', buildTestTaskYaml());
  await ctx.seed();

  await requestDefinitionChange(ctx.context, {
    kind: 'define',
    input: buildTestDefineInput({
      definitionID: 'water-the-tomatoes',
      brief: 'Water them well.',
    }),
  });

  const seed = await readResetSeed(ctx.writer.db, 0);

  expect(seed?.taskVersions.map((version) => version.definition_id)).toStrictEqual([
    'water-the-tomatoes',
    'water-the-tomatoes',
  ]);

  expect(seed?.payload['repoTasks']).toStrictEqual([
    { id: 'water-the-tomatoes', hash: expect.any(String) },
  ]);
});
