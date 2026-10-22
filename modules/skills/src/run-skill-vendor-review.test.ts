import { expect, mock, test } from 'bun:test';
import { buildMockCheckerAnswer } from '@heynixie/memory/test-utils';
import { runSkillVendorReview } from './run-skill-vendor-review';

test("it asks the checker about every file of the skill and returns the checker's answer", async () => {
  const answer = buildMockCheckerAnswer();
  const check = mock(() => Promise.resolve(answer));

  const reviewed = await runSkillVendorReview(
    check,
    new Map([
      ['SKILL.md', '# Tides\n'],
      ['scripts/read.py', 'print(1)\n'],
    ]),
  );

  expect(reviewed).toBe(answer);

  expect(check).toHaveBeenCalledExactlyOnceWith({
    prompt: expect.toStartWith('You review one third-party skill'),
    input: '«file SKILL.md»\n# Tides\n\n«/file»\n\n«file scripts/read.py»\nprint(1)\n\n«/file»',
  });
});

test('it cuts a skill past 100,000 characters and says so', async () => {
  const check = mock(() => Promise.resolve(buildMockCheckerAnswer()));

  await runSkillVendorReview(check, new Map([['table.csv', 'x'.repeat(120_000)]]));

  expect(check).toHaveBeenCalledExactlyOnceWith({
    prompt: expect.toStartWith('You review one third-party skill'),
    input: `«file table.csv»\n${'x'.repeat(100_000 - '«file table.csv»\n'.length)}\n«the rest of the skill is cut»`,
  });
});
