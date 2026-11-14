import { expect, test } from 'bun:test';
import { recallPageLimitBytes, toolOutputLimitTokens } from '@heynixie/wire';
import { buildToolOutputPlan } from './build-tool-output-plan';

test('it serves a 700-line page whole under the CLI defaults', () => {
  const plan = buildToolOutputPlan({ HOME: '/home/tide' }, 'past-default');

  expect(plan.served.split('\n')).toHaveLength(700);
  expect(plan.tool).toStrictEqual({ kind: 'page', isTruncated: false });
  expect(plan.env).toStrictEqual({ HOME: '/home/tide' });
});

test('it serves a page cut at the guest limit under the guest settings', () => {
  const plan = buildToolOutputPlan({ HOME: '/home/tide' }, 'at-guest-limit');

  expect(plan.served.split('\n')).toHaveLength(240);
  expect(plan.tool).toStrictEqual({ kind: 'page', isTruncated: true });

  expect(plan.env).toStrictEqual({
    HOME: '/home/tide',
    MAX_MCP_OUTPUT_TOKENS: String(toolOutputLimitTokens),
    ENABLE_MCP_LARGE_OUTPUT_FILES: '0',
  });
});

test('it serves a 1500-line page past the guest limit under the guest settings', () => {
  const plan = buildToolOutputPlan({ HOME: '/home/tide' }, 'past-guest-limit');

  expect(plan.served.split('\n')).toHaveLength(1500);
  expect(plan.tool).toStrictEqual({ kind: 'page', isTruncated: false });
  expect(plan.env).toContainEntry(['ENABLE_MCP_LARGE_OUTPUT_FILES', '0']);
});

test('it serves a filler of exactly the page limit in bytes under the guest settings', () => {
  const plan = buildToolOutputPlan({ HOME: '/home/tide' }, 'at-page-limit');

  expect(Buffer.byteLength(plan.served)).toBe(recallPageLimitBytes);
  expect(plan.served.split('\n').at(-1)).toStartWith('Log 199: ');
  expect(plan.tool).toStrictEqual({ kind: 'page', isTruncated: false });
  expect(plan.env).toContainEntry(['MAX_MCP_OUTPUT_TOKENS', String(toolOutputLimitTokens)]);
});

test('it serves a filler of 30,000 characters whose last line is numbered', () => {
  const plan = buildToolOutputPlan({ HOME: '/home/tide' }, 'past-page-limit-cut');

  expect(plan.served).toHaveLength(30_000);
  expect(plan.served.split('\n').at(-1)).toStartWith('Log 299: ');
  expect(plan.env).toContainEntry(['ENABLE_MCP_LARGE_OUTPUT_FILES', '0']);
});

test('it serves 150 items in the recall shape as one JSON result of about 20,000 bytes', () => {
  const plan = buildToolOutputPlan({ HOME: '/home/tide' }, 'recall-shape');
  const result = JSON.parse(plan.served);

  expect(result.items).toHaveLength(150);
  expect(result.items[149]).toMatchObject({ itemID: 'k000000149', subject: 'owner', version: 1 });
  expect(Buffer.byteLength(plan.served)).toBeWithin(19_000, recallPageLimitBytes + 1);
  expect(plan.tool).toStrictEqual({ kind: 'recall' });
});

test('it serves a photo with its text through the photo tool', () => {
  expect(buildToolOutputPlan({ HOME: '/home/tide' }, 'image')).toStrictEqual({
    prompt: 'Call read_photo once for page 1, then reply DONE.',
    served: '{"eventID":"12","number":1}',
    tool: { kind: 'photo' },
    env: {
      HOME: '/home/tide',
      MAX_MCP_OUTPUT_TOKENS: String(toolOutputLimitTokens),
      ENABLE_MCP_LARGE_OUTPUT_FILES: '0',
    },
  });
});

test('it runs the CLI defaults with an empty environment when the target sets none', () => {
  expect(buildToolOutputPlan(undefined, 'past-default').env).toStrictEqual({});
});
