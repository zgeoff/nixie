// oxlint-disable one-var, max-statements -- one spike runner; each check reads top to bottom
// Builds a throwaway definitions repo, reads it through the git source and the path source, and
// prints each check. Env: SPIKE_WORK, a scratch directory that the run creates and removes.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { DefinitionsSource, Snapshot, SourceFilter } from './sources.ts';
import { buildContentHash, createGitSource, createPathSource } from './sources.ts';

interface Fixture {
  checkout: string;
  git: DefinitionsSource;
  origin: string;
  path: DefinitionsSource;
  work: string;
}

const filter: SourceFilter = { extensions: new Set(['.json', '.md', '.yaml', '.yml']), root: '' };

function runGit(cwd: string, args: string[]): string {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
  }
  return result.stdout.trim();
}

function writeFile(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

function writeDefinitions(checkout: string): void {
  writeFile(join(checkout, 'persona.md'), '# Persona\n\nWarm, brief, never chirpy.\n');
  for (let index = 0; index < 24; index += 1) {
    const job = `id: job-${index}\nschedule: "0 7 * * *"\ntools: [mail_read, calendar_read]\n`;
    writeFile(join(checkout, 'jobs', `job-${index}.yaml`), job);
    const rule = `id: rule-${index}\noutcome: allow\ntool: mail_label\n`;
    writeFile(join(checkout, 'rules', `rule-${index}.yaml`), rule);
  }
  writeFile(join(checkout, 'README.txt'), 'not a definition\n');
  writeFile(join(checkout, '.github', 'workflow.yaml'), 'on: push\n');
  writeFile(join(checkout, 'scripts', 'seed.sh'), 'echo seed\n');
}

function sendChange(fixture: Fixture, message: string): void {
  runGit(fixture.checkout, ['add', '-A']);
  runGit(fixture.checkout, ['commit', '--quiet', '-m', message]);
  runGit(fixture.checkout, ['push', '--quiet', fixture.origin, 'main']);
}

function createFixture(work: string): Fixture {
  rmSync(work, { force: true, recursive: true });
  const checkout = join(work, 'checkout');
  const origin = join(work, 'origin.git');
  mkdirSync(checkout, { recursive: true });
  runGit(work, ['init', '--bare', '--quiet', '--initial-branch=main', origin]);
  runGit(checkout, ['init', '--quiet', '--initial-branch=main']);
  runGit(checkout, ['config', 'user.email', 'spike@example.invalid']);
  runGit(checkout, ['config', 'user.name', 'spike']);
  runGit(checkout, ['config', 'core.autocrlf', 'false']);
  writeDefinitions(checkout);
  const remote = { cacheDir: join(work, 'cache.git'), ref: 'main', url: `file://${origin}` };
  const fixture = {
    checkout,
    git: createGitSource(remote, filter),
    origin,
    path: createPathSource(checkout, filter),
    work,
  };
  sendChange(fixture, 'definitions');
  return fixture;
}

function formatMs(started: number): string {
  return `${(performance.now() - started).toFixed(1)} ms`;
}

async function checkSameCommit(fixture: Fixture): Promise<Snapshot> {
  console.log('== 1. the same commit through both sources');
  let started = performance.now();
  const fromGit = await fixture.git.snapshot();
  console.log(`git first snapshot (init, fetch, read): ${formatMs(started)}`);
  started = performance.now();
  const again = await fixture.git.snapshot();
  console.log(`git second snapshot (fetch, read): ${formatMs(started)}`);
  started = performance.now();
  const fromPath = await fixture.path.snapshot();
  console.log(`path snapshot: ${formatMs(started)}`);
  console.log(`files: git ${fromGit.files.size}, path ${fromPath.files.size}`);
  console.log(`git revision ${fromGit.revision.slice(0, 12)}, hash ${fromGit.contentHash}`);
  console.log(`path revision ${fromPath.revision.slice(0, 12)}, hash ${fromPath.contentHash}`);
  console.log(`hashes match: ${fromGit.contentHash === fromPath.contentHash}`);
  console.log(`second git snapshot matches: ${again.contentHash === fromGit.contentHash}`);
  console.log(`git skipped: ${fromGit.skipped.toSorted().join(', ')}`);
  console.log(`path skipped: ${fromPath.skipped.toSorted().join(', ')}`);
  return fromGit;
}

async function checkLineEndings(fixture: Fixture, base: Snapshot): Promise<void> {
  console.log('== 2. CRLF line endings in the path source');
  const personaPath = join(fixture.checkout, 'persona.md');
  const lf = readFileSync(personaPath, 'utf8');
  writeFileSync(personaPath, lf.replaceAll('\n', '\r\n'));
  const crlf = await fixture.path.snapshot();
  const raw = new Map([...crlf.files, ['persona.md', readFileSync(personaPath)]]);
  console.log(`raw bytes hash matches git: ${buildContentHash(raw) === base.contentHash}`);
  console.log(`normalised hash matches git: ${crlf.contentHash === base.contentHash}`);
  writeFileSync(personaPath, lf);
}

async function checkLocalEdits(fixture: Fixture, base: Snapshot): Promise<void> {
  console.log('== 3. an uncommitted change in the path source');
  const rulePath = join(fixture.checkout, 'rules', 'rule-0.yaml');
  writeFileSync(rulePath, 'id: rule-0\noutcome: deny\ntool: mail_label\n');
  const edited = await fixture.path.snapshot();
  console.log(`hash differs from the commit: ${edited.contentHash !== base.contentHash}`);
  runGit(fixture.checkout, ['checkout', '--quiet', '--', 'rules/rule-0.yaml']);
  console.log('== 4. a symlink that leaves the root');
  symlinkSync(fixture.work, join(fixture.checkout, 'escape'));
  try {
    await fixture.path.snapshot();
    console.log('path snapshot: accepted');
  } catch (error) {
    console.log(`path snapshot: refused: ${(error as Error).message}`);
  }
  rmSync(join(fixture.checkout, 'escape'));
}

async function checkNarrowRoot(fixture: Fixture): Promise<void> {
  console.log('== 5. a root narrower than the repo');
  const remote = {
    cacheDir: join(fixture.work, 'cache-rules.git'),
    ref: 'main',
    url: `file://${fixture.origin}`,
  };
  const rules = await createGitSource(remote, { ...filter, root: 'rules' }).snapshot();
  const rulesPath = await createPathSource(join(fixture.checkout, 'rules'), filter).snapshot();
  const [first] = rules.files.keys();
  console.log(`files under rules/: ${rules.files.size}, first path ${first}`);
  console.log(`matches a path source on rules/: ${rules.contentHash === rulesPath.contentHash}`);
}

async function checkChanges(fixture: Fixture, base: Snapshot): Promise<void> {
  console.log('== 6. change detection');
  let started = performance.now();
  const before = await fixture.git.probe();
  console.log(`git probe, no change: ${formatMs(started)}, same: ${before === base.revision}`);
  writeFile(join(fixture.checkout, 'jobs', 'job-new.yaml'), 'id: job-new\n');
  sendChange(fixture, 'add a job');
  started = performance.now();
  const after = await fixture.git.probe();
  console.log(`git probe after a push: ${formatMs(started)}, changed: ${after !== before}`);
  started = performance.now();
  const pathProbe = await fixture.path.probe();
  console.log(`path probe: ${formatMs(started)}, changed: ${pathProbe !== base.contentHash}`);
  const next = await fixture.git.snapshot();
  const nextPath = await fixture.path.snapshot();
  console.log(`after the push, hashes match: ${next.contentHash === nextPath.contentHash}`);
}

async function checkPinnedCommit(fixture: Fixture, base: Snapshot): Promise<void> {
  console.log('== 7. a pinned commit');
  const remote = {
    cacheDir: join(fixture.work, 'cache-pinned.git'),
    ref: base.revision,
    url: `file://${fixture.origin}`,
  };
  const old = await createGitSource(remote, filter).snapshot();
  console.log(
    `pinned commit read, hash matches the first: ${old.contentHash === base.contentHash}`,
  );
}

async function runChecks(): Promise<void> {
  const work = process.env.SPIKE_WORK;
  if (!work) {
    throw new Error('set SPIKE_WORK');
  }
  const fixture = createFixture(work);
  try {
    const base = await checkSameCommit(fixture);
    await checkLineEndings(fixture, base);
    await checkLocalEdits(fixture, base);
    await checkNarrowRoot(fixture);
    await checkChanges(fixture, base);
    await checkPinnedCommit(fixture, base);
  } finally {
    rmSync(work, { force: true, recursive: true });
  }
}

await runChecks();
