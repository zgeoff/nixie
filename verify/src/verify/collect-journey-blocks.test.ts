import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { collectJourneyBlocks } from './collect-journey-blocks';

async function setupTest() {
  const journeyPath = join(
    import.meta.dir,
    '..',
    '..',
    '..',
    '.agents',
    'skills',
    'verify',
    'references',
    'feature-policy-proposal.md',
  );

  const journey = await Bun.file(journeyPath).text();

  return { journeyBlocks: collectJourneyBlocks(journey) };
}

test('#collectJourneyBlocks returns the body of each bash block and skips other blocks', () => {
  const markdown =
    'text\n\n```bash\nbun verify use\n```\n\n```ts\nconst a = 1;\n```\n\n```bash\nls\n```\n';

  expect(collectJourneyBlocks(markdown)).toStrictEqual(['bun verify use\n', 'ls\n']);
});

test('#collectJourneyBlocks finds one reply scripted for the policy-proposal turn after the approval', async () => {
  const ctx = await setupTest();

  const approvalIndex = ctx.journeyBlocks.findIndex((block) =>
    block.includes("--name 'Run memory.export'"),
  );

  const scriptedBeforeApproval = ctx.journeyBlocks
    .slice(0, approvalIndex)
    .filter((block) => block.includes('action script-reply --text'));

  expect(approvalIndex).toBeGreaterThan(-1);
  expect(scriptedBeforeApproval).toHaveLength(1);
});

test('#collectJourneyBlocks finds one policy-proposal check of the turn after the approval, through the approved call', async () => {
  const ctx = await setupTest();

  const turnChecks = ctx.journeyBlocks.filter((block) => block.includes('task.step_errored'));

  expect(turnChecks).toHaveLength(1);
  expect(turnChecks[0]).toContain("json_extract(payload, '$.usedBy')");
});

test('#collectJourneyBlocks finds one policy-proposal check of the export outcome, through the approved call', async () => {
  const ctx = await setupTest();

  const outcomeChecks = ctx.journeyBlocks.filter((block) =>
    block.includes("'$.reason') as reason"),
  );

  expect(outcomeChecks).toHaveLength(1);
  expect(outcomeChecks[0]).toContain("json_extract(payload, '$.usedBy')");
  expect(outcomeChecks[0]).not.toContain("'$.tool') = 'memory.export'");
});
