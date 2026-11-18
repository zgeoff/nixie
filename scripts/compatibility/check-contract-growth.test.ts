import { expect, onTestFinished, test } from 'bun:test';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';

function setupTest() {
  const directory = mkdtempSync(join(tmpdir(), 'nixie-contract-growth-'));

  onTestFinished(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  const binPath = join(directory, 'bin');

  mkdirSync(binPath);

  // stands in for docker, which would run oasdiff: prints the breaks that the test sets
  writeFileSync(join(binPath, 'docker'), '#!/usr/bin/env bash\ncat "$BREAKS_PATH"\n');
  chmodSync(join(binPath, 'docker'), 0o755);
  writeFileSync(join(directory, 'last.json'), '{}');
  writeFileSync(join(directory, 'openapi.json'), '{}');

  // breaks and entries are plain { method, path, value } records: a break is oasdiff's report of
  // one added response enum value at its level 3 (an error), and an entry is the line of
  // accepted-breaks.txt that accepts one such break
  const runCheck = async (
    breaks: readonly { method: string; path: string; value: string }[],
    entries: readonly { method: string; path: string; value: string }[],
    header = '',
  ) => {
    writeFileSync(
      join(directory, 'breaks.json'),
      JSON.stringify(
        breaks.map((found) => ({
          level: 3,
          section: 'paths',
          operation: found.method,
          path: found.path,
          text: `added the new \`${found.value}\` enum value to the \`reason\` response property for the response status \`200\``,
        })),
      ),
    );

    writeFileSync(
      join(directory, 'accepted-breaks.txt'),
      header +
        entries
          .map(
            (line) =>
              `${line.method} ${line.path} added the new \`${line.value}\` enum value to the \`reason\` response property for the response status \`200\`\n`,
          )
          .join(''),
    );

    const result =
      await $`bash ${join(import.meta.dir, 'check-contract-growth.sh')} ${join(directory, 'last.json')} ${join(directory, 'openapi.json')} ${join(directory, 'accepted-breaks.txt')}`
        .env({
          ...process.env,
          PATH: `${binPath}:${process.env['PATH'] ?? ''}`,
          BREAKS_PATH: join(directory, 'breaks.json'),
        })
        .nothrow()
        .quiet();

    return {
      exitCode: result.exitCode,
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString(),
    };
  };

  return { runCheck };
}

test('it passes a contract that has no break', async () => {
  const ctx = setupTest();

  const result = await ctx.runCheck([], []);

  expect(result).toStrictEqual({
    exitCode: 0,
    stdout: 'the contract only grows, apart from the breaks it accepts\n',
    stderr: '',
  });
});

test('it fails a new response enum value that no line accepts', async () => {
  const ctx = setupTest();

  const result = await ctx.runCheck(
    [{ method: 'POST', path: '/memory/listProposals', value: 'self_note' }],
    [],
  );

  expect(result).toStrictEqual({
    exitCode: 1,
    stdout: `error: POST /memory/listProposals added the new \`self_note\` enum value to the \`reason\` response property for the response status \`200\`\n::error::the contract breaks a client of the last release in a way no accepted-breaks line names\n`,
    stderr: '',
  });
});

test('it passes a break that a line names, behind a comment and an issue prefix', async () => {
  const ctx = setupTest();

  const result = await ctx.runCheck(
    [{ method: 'POST', path: '/memory/listProposals', value: 'self_note' }],
    [{ method: 'GEO-0: POST', path: '/memory/listProposals', value: 'self_note' }],
    '# accepted breaks\n',
  );

  expect(result).toStrictEqual({
    exitCode: 0,
    stdout: `accepted: POST /memory/listProposals added the new \`self_note\` enum value to the \`reason\` response property for the response status \`200\`\nthe contract only grows, apart from the breaks it accepts\n`,
    stderr: '',
  });
});

test('it fails a second break beside the accepted one', async () => {
  const ctx = setupTest();

  const result = await ctx.runCheck(
    [
      { method: 'POST', path: '/memory/listProposals', value: 'self_note' },
      { method: 'POST', path: '/memory/listProposals', value: 'other_reason' },
    ],
    [{ method: 'POST', path: '/memory/listProposals', value: 'self_note' }],
  );

  expect(result).toStrictEqual({
    exitCode: 1,
    stdout: `accepted: POST /memory/listProposals added the new \`self_note\` enum value to the \`reason\` response property for the response status \`200\`\nerror: POST /memory/listProposals added the new \`other_reason\` enum value to the \`reason\` response property for the response status \`200\`\n::error::the contract breaks a client of the last release in a way no accepted-breaks line names\n`,
    stderr: '',
  });
});

test('it fails a break that differs from the accepted one only in case', async () => {
  const ctx = setupTest();

  const result = await ctx.runCheck(
    [{ method: 'POST', path: '/memory/listProposals', value: 'SELF_NOTE' }],
    [{ method: 'POST', path: '/memory/listProposals', value: 'self_note' }],
  );

  expect(result).toStrictEqual({
    exitCode: 1,
    stdout: `error: POST /memory/listProposals added the new \`SELF_NOTE\` enum value to the \`reason\` response property for the response status \`200\`\n::error::the contract breaks a client of the last release in a way no accepted-breaks line names\n`,
    stderr: '',
  });
});

test('it fails a break that a line names under another method', async () => {
  const ctx = setupTest();

  const result = await ctx.runCheck(
    [{ method: 'POST', path: '/memory/listProposals', value: 'self_note' }],
    [{ method: 'GET', path: '/memory/listProposals', value: 'self_note' }],
  );

  expect(result).toStrictEqual({
    exitCode: 1,
    stdout: `error: POST /memory/listProposals added the new \`self_note\` enum value to the \`reason\` response property for the response status \`200\`\n::error::the contract breaks a client of the last release in a way no accepted-breaks line names\n`,
    stderr: '',
  });
});

test('it fails a break that a line names only under a longer path', async () => {
  const ctx = setupTest();

  const result = await ctx.runCheck(
    [{ method: 'POST', path: '/memory/listProposals', value: 'self_note' }],
    [{ method: 'POST', path: '/memory/listProposalsArchive', value: 'self_note' }],
  );

  expect(result).toStrictEqual({
    exitCode: 1,
    stdout: `error: POST /memory/listProposals added the new \`self_note\` enum value to the \`reason\` response property for the response status \`200\`\n::error::the contract breaks a client of the last release in a way no accepted-breaks line names\n`,
    stderr: '',
  });
});
