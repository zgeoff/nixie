import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startWriter } from '@heynixie/log';
import { buildRuleChangeKind } from './build-rule-change-kind';
import { createPathSource } from './create-path-source';
import { runDefinitionsExports } from './run-definitions-exports';
import { runInForceSeed } from './run-in-force-seed';
import { runSeed } from './run-seed';
import { buildStubDefinitionsRepo } from './test-utils/build-stub-definitions-repo';
import { writeRuleResolution } from './write-rule-resolution';
import { writeRuntimeRule } from './write-runtime-rule';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'nixie-rule-exports-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const root = join(directory, 'definitions');

  await mkdir(join(root, 'rules'), { recursive: true });

  const clock = { now: () => Date.parse('2026-10-20T08:00:00Z'), sleep: () => Promise.resolve() };

  const writer = await startWriter({ dataDir: directory, clock });

  stack.defer(() => writer.stop());

  const deploymentKey = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);

  const log = { writer, deploymentKey, projections: [] };
  const repo = buildStubDefinitionsRepo(root);
  const onError = mock<(error: unknown) => void>();

  return {
    root,
    repo,
    onError,
    context: {
      log,
      clock,
      definitions: () => ({ snapshotHash: 'snapshot-a' }),
      runInForceSeed: () => runInForceSeed({ log, buildPolicy: () => ({ rules: [], tools: [] }) }),
    },
    seed: () =>
      runSeed({
        log,
        source: createPathSource({ directory: root }),
        buildPolicy: () => ({ rules: [], tools: [] }),
      }),
    runExports: () => runDefinitionsExports({ log, repo, kinds: [buildRuleChangeKind()], onError }),
  };
}

test('it puts two runtime changes into one pull request on the rules branch', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 3\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  await writeFile(
    join(ctx.root, 'rules', 'mail.yaml'),
    '# Mail rules\nask-mail:\n  outcome: ask\n  tools: [mail.send]\n',
  );

  await ctx.seed();

  await writeRuntimeRule(ctx.context, {
    ruleID: 'ask-mail',
    rule: { outcome: 'deny', tools: ['mail.send'] },
    changedBy: 'owner',
    reason: 'No mail this week.',
  });

  await ctx.runExports();

  await writeRuntimeRule(ctx.context, {
    ruleID: 'deny-shell',
    rule: { outcome: 'deny', tools: ['shell.run'] },
    changedBy: 'nixie',
    reason: 'You asked for no shell commands.',
  });

  await ctx.runExports();

  const pullRequests = ctx.repo.readPullRequests();

  expect(
    pullRequests.map((request) => ({
      number: request.number,
      state: request.state,
      branch: request.change.branch,
      files: Object.fromEntries(request.change.files),
    })),
  ).toStrictEqual([
    {
      number: 1,
      state: 'open',
      branch: 'nixie/rules',
      files: {
        'rules/mail.yaml': '# Mail rules\nask-mail:\n  outcome: "deny"\n  tools: ["mail.send"]\n',
        'rules/nixie.yaml': 'deny-shell:\n  outcome: "deny"\n  tools: ["shell.run"]\n',
      },
    },
  ]);
});

test('it lists each change in the pull request body with who made it and why', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 3\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  await ctx.seed();

  await writeRuntimeRule(ctx.context, {
    ruleID: 'deny-shell',
    rule: { outcome: 'deny', tools: ['shell.run'] },
    changedBy: 'nixie',
    reason: 'You asked for no shell commands.',
  });

  await ctx.runExports();

  const [pullRequest] = ctx.repo.readPullRequests();

  expect(pullRequest?.change.body).toMatch(
    /^- `deny-shell`: .+ Changed by nixie: You asked for no shell commands\.$/mu,
  );
});

test('it leaves a mandate rule out of the pull request', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 3\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  await ctx.seed();

  await writeRuntimeRule(ctx.context, {
    ruleID: 'deny-shell',
    rule: { outcome: 'deny', tools: ['shell.run'] },
    changedBy: 'owner',
    reason: 'No shell commands.',
  });

  await writeRuntimeRule(ctx.context, {
    ruleID: 'allow-invites',
    rule: {
      outcome: 'allow',
      tools: ['calendar.invite'],
      mandate: 'calendar-day',
      expires: '2026-10-20T23:59:59Z',
    },
    changedBy: 'owner',
    reason: 'Handle my invites today.',
  });

  await ctx.runExports();

  const [pullRequest] = ctx.repo.readPullRequests();

  expect({
    paths: [...(pullRequest?.change.files.keys() ?? [])],
    isMandateListed: pullRequest?.change.body.includes('allow-invites'),
    isMandateWritten: [...(pullRequest?.change.files.values() ?? [])].some(
      (text) => text?.includes('allow-invites') === true,
    ),
  }).toStrictEqual({
    paths: ['rules/nixie.yaml'],
    isMandateListed: false,
    isMandateWritten: false,
  });
});

test('it leaves the removal of a rule your definitions lack out of the pull request', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 3\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  await ctx.seed();

  await writeRuntimeRule(ctx.context, {
    ruleID: 'allow-invites',
    rule: {
      outcome: 'allow',
      tools: ['calendar.invite'],
      mandate: 'calendar-day',
      expires: '2026-10-20T23:59:59Z',
    },
    changedBy: 'owner',
    reason: 'Handle my invites today.',
  });

  await writeRuntimeRule(ctx.context, {
    ruleID: 'allow-invites',
    rule: null,
    changedBy: 'owner',
    reason: 'I am back at my desk.',
  });

  await writeRuntimeRule(ctx.context, {
    ruleID: 'deny-shell',
    rule: { outcome: 'deny', tools: ['shell.run'] },
    changedBy: 'owner',
    reason: 'No shell commands.',
  });

  await ctx.runExports();

  const [pullRequest] = ctx.repo.readPullRequests();

  expect(pullRequest?.change.body.includes('allow-invites')).toBe(false);
});

test('it rebuilds the rolling pull request when its changes return to a set an earlier export held', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 3\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  await writeFile(
    join(ctx.root, 'rules', 'mail.yaml'),
    'ask-mail:\n  outcome: ask\n  tools: [mail.send]\n',
  );

  await ctx.seed();

  await writeRuntimeRule(ctx.context, {
    ruleID: 'ask-mail',
    rule: { outcome: 'deny', tools: ['mail.send'] },
    changedBy: 'owner',
    reason: 'No mail this week.',
  });

  await ctx.runExports();

  await writeRuntimeRule(ctx.context, {
    ruleID: 'deny-shell',
    rule: { outcome: 'deny', tools: ['shell.run'] },
    changedBy: 'owner',
    reason: 'No shell commands.',
  });

  await ctx.runExports();

  await writeRuntimeRule(ctx.context, {
    ruleID: 'deny-shell',
    rule: null,
    changedBy: 'owner',
    reason: 'Shell commands are fine again.',
  });

  await ctx.runExports();

  const pullRequests = ctx.repo.readPullRequests();

  expect(
    pullRequests.map((request) => ({
      state: request.state,
      paths: [...request.change.files.keys()],
    })),
  ).toStrictEqual([{ state: 'open', paths: ['rules/mail.yaml'] }]);
});

test('it rebuilds the rolling pull request when the repo moves a changed rule to another file', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 3\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  await writeFile(
    join(ctx.root, 'rules', 'mail.yaml'),
    'ask-mail:\n  outcome: ask\n  tools: [mail.send]\n',
  );

  await ctx.seed();

  await writeRuntimeRule(ctx.context, {
    ruleID: 'ask-mail',
    rule: { outcome: 'deny', tools: ['mail.send'] },
    changedBy: 'owner',
    reason: 'No mail this week.',
  });

  await ctx.runExports();

  await rm(join(ctx.root, 'rules', 'mail.yaml'));

  await writeFile(
    join(ctx.root, 'rules', 'messages.yaml'),
    'ask-mail:\n  outcome: ask\n  tools: [mail.send]\n',
  );

  await ctx.seed();
  await ctx.runExports();

  const files = ctx.repo.readPullRequests().map((request) => request.change.files);

  expect(files).toStrictEqual([
    new Map([['rules/messages.yaml', 'ask-mail:\n  outcome: "deny"\n  tools: ["mail.send"]\n']]),
  ]);
});

test('it rebuilds the rolling pull request when the repo moves a changed rule away and back', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 3\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  await writeFile(
    join(ctx.root, 'rules', 'mail.yaml'),
    'ask-mail:\n  outcome: ask\n  tools: [mail.send]\n',
  );

  await ctx.seed();

  await writeRuntimeRule(ctx.context, {
    ruleID: 'ask-mail',
    rule: { outcome: 'deny', tools: ['mail.send'] },
    changedBy: 'owner',
    reason: 'No mail this week.',
  });

  await ctx.runExports();

  await rm(join(ctx.root, 'rules', 'mail.yaml'));

  await writeFile(
    join(ctx.root, 'rules', 'messages.yaml'),
    'ask-mail:\n  outcome: ask\n  tools: [mail.send]\n',
  );

  await ctx.seed();
  await ctx.runExports();

  await rm(join(ctx.root, 'rules', 'messages.yaml'));

  await writeFile(
    join(ctx.root, 'rules', 'mail.yaml'),
    'ask-mail:\n  outcome: ask\n  tools: [mail.send]\n',
  );

  await ctx.seed();
  await ctx.runExports();

  const files = ctx.repo.readPullRequests().map((request) => request.change.files);

  expect(files).toStrictEqual([
    new Map([['rules/mail.yaml', 'ask-mail:\n  outcome: "deny"\n  tools: ["mail.send"]\n']]),
  ]);
});

test("it rebuilds the rolling pull request on the repo's newer version when you keep nixie's", async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 3\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  await writeFile(
    join(ctx.root, 'rules', 'mail.yaml'),
    'ask-mail:\n  outcome: ask\n  tools: [mail.send]\n',
  );

  await ctx.seed();

  await writeRuntimeRule(ctx.context, {
    ruleID: 'ask-mail',
    rule: { outcome: 'ask', tools: ['mail.send', 'mail.reply'] },
    changedBy: 'owner',
    reason: 'Replies need the same check.',
  });

  await ctx.runExports();

  await writeFile(
    join(ctx.root, 'rules', 'mail.yaml'),
    'ask-mail:\n  outcome: deny\n  tools: [mail.send]\n  note: Mail stays off.\n',
  );

  await ctx.seed();

  await writeRuleResolution(ctx.context, { ruleID: 'ask-mail', keep: 'nixie' });

  await ctx.runExports();

  const pullRequests = ctx.repo.readPullRequests();

  const newest = await ctx.repo.readBaseRevision();

  expect(
    pullRequests.map((request) => ({
      number: request.number,
      state: request.state,
      isOnNewestBase: request.revision === newest,
      text: request.change.files.get('rules/mail.yaml'),
    })),
  ).toStrictEqual([
    {
      number: 1,
      state: 'open',
      isOnNewestBase: true,
      text: 'ask-mail:\n  outcome: "ask"\n  tools: ["mail.reply","mail.send"]\n',
    },
  ]);
});

test("it closes the rolling pull request when you keep the repo's version of its only change", async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 3\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  await writeFile(
    join(ctx.root, 'rules', 'mail.yaml'),
    'ask-mail:\n  outcome: ask\n  tools: [mail.send]\n',
  );

  await ctx.seed();

  await writeRuntimeRule(ctx.context, {
    ruleID: 'ask-mail',
    rule: { outcome: 'ask', tools: ['mail.send', 'mail.reply'] },
    changedBy: 'owner',
    reason: 'Replies need the same check.',
  });

  await ctx.runExports();

  await writeFile(
    join(ctx.root, 'rules', 'mail.yaml'),
    'ask-mail:\n  outcome: deny\n  tools: [mail.send]\n',
  );

  await ctx.seed();

  await writeRuleResolution(ctx.context, { ruleID: 'ask-mail', keep: 'repo' });

  await ctx.runExports();

  const states = ctx.repo.readPullRequests().map((request) => request.state);

  expect(states).toStrictEqual(['closed']);
});

test('it leaves a merged pull request merged once the seed adopts its changes', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 3\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  await ctx.seed();

  await writeRuntimeRule(ctx.context, {
    ruleID: 'deny-shell',
    rule: { outcome: 'deny', tools: ['shell.run'] },
    changedBy: 'owner',
    reason: 'No shell commands.',
  });

  await ctx.runExports();
  await ctx.repo.mergePullRequest(1);
  await ctx.seed();

  const result = await ctx.runExports();

  expect({
    states: ctx.repo.readPullRequests().map((request) => request.state),
    exported: result.exported,
    errors: ctx.onError.mock.calls.length,
  }).toStrictEqual({ states: ['merged'], exported: [], errors: 0 });
});

test('it opens no pull request that would write a rule into a prompt part under rules/', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.root, 'nixie.yaml'),
    'format: 3\nprompts:\n  writer:\n    instruction: rules/nixie.yaml\n',
  );

  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');
  await writeFile(join(ctx.root, 'rules', 'nixie.yaml'), 'Write short notes.\n');

  await ctx.seed();

  await writeRuntimeRule(ctx.context, {
    ruleID: 'deny-shell',
    rule: { outcome: 'deny', tools: ['shell.run'] },
    changedBy: 'owner',
    reason: 'No shell commands.',
  });

  await ctx.runExports();

  expect({
    pullRequests: ctx.repo.readPullRequests().length,
    error: ctx.onError.mock.calls[0]?.[0],
  }).toStrictEqual({
    pullRequests: 0,
    error: new Error('the rule export would change a prompt part file under rules/'),
  });
});

test('it opens no pull request on a repo whose format applies no rule file', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 2\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  await ctx.seed();

  await writeRuntimeRule(ctx.context, {
    ruleID: 'deny-shell',
    rule: { outcome: 'deny', tools: ['shell.run'] },
    changedBy: 'owner',
    reason: 'No shell commands.',
  });

  await ctx.runExports();

  expect({
    pullRequests: ctx.repo.readPullRequests().length,
    error: ctx.onError.mock.calls[0]?.[0],
  }).toStrictEqual({
    pullRequests: 0,
    error: new Error('the definitions repo reads format 2, which applies no rule file'),
  });
});
