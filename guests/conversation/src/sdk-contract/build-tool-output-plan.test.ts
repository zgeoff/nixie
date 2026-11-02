import { expect, test } from 'bun:test';
import { toolOutputLimitTokens } from '@heynixie/wire';
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
