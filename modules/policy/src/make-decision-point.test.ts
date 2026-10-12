import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeDecisionPoint } from './make-decision-point';

test('it allows a listed fetch tool through slice1.read-only', () => {
  const decide = makeDecisionPoint({
    findDeclaration: () => ({
      effects: ['fetch'],
      destinations: [],
      amount: null,
      content: [],
      results: {},
    }),
  });

  expect(decide({ tool: 'web_fetch', toolList: ['web_fetch'] })).toStrictEqual({
    decision: {
      outcome: 'allow',
      stage: 3,
      rule: { id: 'slice1.read-only', revision: 1 },
    },
    sentence: null,
  });
});

test('it denies a listed send tool with slice1.read-only and its sentence', () => {
  const decide = makeDecisionPoint({
    findDeclaration: () => ({
      effects: ['send'],
      destinations: ['to'],
      amount: null,
      content: ['body'],
      results: {},
    }),
  });

  expect(decide({ tool: 'gmail_send', toolList: ['gmail_send'] })).toStrictEqual({
    decision: { outcome: 'deny', stage: 3, rule: { id: 'slice1.read-only', revision: 1 } },
    sentence:
      'slice1.read-only: Only a tool whose effects are read, fetch or note may run; every other call is denied.',
  });
});

test('it looks up the declaration of the tool the call names', () => {
  const findDeclaration = mock(() => null);
  const decide = makeDecisionPoint({ findDeclaration });

  decide({ tool: 'web_fetch', toolList: ['web_fetch'] });

  expect(findDeclaration).toHaveBeenCalledExactlyOnceWith('web_fetch');
});

test('it denies an unknown tool at the registry stage', () => {
  const decide = makeDecisionPoint({ findDeclaration: () => null });

  expect(decide({ tool: 'nope', toolList: ['nope'] })).toStrictEqual({
    decision: { outcome: 'deny', stage: 1, rule: null },
    sentence: 'The tool nope is unknown or has no effect declaration.',
  });
});

test('it denies a tool that declares no effect at the registry stage', () => {
  const decide = makeDecisionPoint({
    findDeclaration: () => ({
      effects: [],
      destinations: [],
      amount: null,
      content: [],
      results: {},
    }),
  });

  expect(decide({ tool: 'bare', toolList: ['bare'] })).toStrictEqual({
    decision: { outcome: 'deny', stage: 1, rule: null },
    sentence: 'The tool bare is unknown or has no effect declaration.',
  });
});

test("it denies a registered tool that is not on the caller's tool list at the scope stage", () => {
  const decide = makeDecisionPoint({
    findDeclaration: () => ({
      effects: ['fetch'],
      destinations: [],
      amount: null,
      content: [],
      results: {},
    }),
  });

  expect(decide({ tool: 'web_fetch', toolList: ['gmail_send'] })).toStrictEqual({
    decision: { outcome: 'deny', stage: 2, rule: null },
    sentence: "The tool web_fetch is not on this run's tool list.",
  });
});

test('it allows test.send through test.allow-send in a test build', () => {
  const decide = makeDecisionPoint({
    findDeclaration: () => ({
      effects: ['send'],
      destinations: ['to'],
      amount: null,
      content: [],
      results: {},
    }),
  });

  expect(decide({ tool: 'test.send', toolList: ['test.send'] })).toStrictEqual({
    decision: { outcome: 'allow', stage: 3, rule: { id: 'test.allow-send', revision: 1 } },
    sentence: null,
  });
});

test('it denies test.send with slice1.read-only in the release bundle, which holds no test rule', async () => {
  const outdir = await mkdtemp(join(tmpdir(), 'nixie-policy-bundle-'));

  onTestFinished(() => rm(outdir, { recursive: true, force: true }));

  const result = await Bun.build({
    entrypoints: [join(import.meta.dir, 'index.ts')],
    outdir,
    target: 'bun',
    naming: 'policy.js',
    define: { NIXIE_TEST_BUILD: 'false' },
  });

  await writeFile(
    join(outdir, 'decide.js'),
    [
      "import { makeDecisionPoint } from './policy.js';",
      'const declaration = { effects: ["send"], destinations: [], amount: null, content: [], results: {} };',
      'const decide = makeDecisionPoint({ findDeclaration: () => declaration });',
      'console.log(JSON.stringify(decide({ tool: "test.send", toolList: ["test.send"] }).decision));',
    ].join('\n'),
  );

  const decided = Bun.spawnSync([process.execPath, join(outdir, 'decide.js')]);
  const bundle = await Bun.file(join(outdir, 'policy.js')).text();

  expect(result.success).toBeTrue();
  expect(JSON.parse(decided.stdout.toString())).toStrictEqual({
    outcome: 'deny',
    stage: 3,
    rule: { id: 'slice1.read-only', revision: 1 },
  });
  expect(bundle).not.toInclude('test.allow-send');
});
