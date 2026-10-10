/* oxlint-disable one-var, @stylistic/lines-around-comment -- each expected error sits on the line it marks */
// Compile-time checks: tsc fails if any marked line stops being an error.
import type { ContractRouterClient } from '@orpc/contract';
import type { contract } from './contract.ts';

declare const client: ContractRouterClient<typeof contract>;

// @ts-expect-error The approve procedure requires the action hash the client rendered.
await client.approvals.approve({ proposalId: 'p1' });

await client.conversation.send({
  clientMessageId: 'm',
  // @ts-expect-error A span source outside the enum is rejected.
  spans: [{ end: 1, source: 'voice', start: 0 }],
  text: 'x',
  thread: 'main',
});

const result = await client.conversation.send({
  clientMessageId: 'm',
  spans: [],
  text: 'x',
  thread: 'main',
});
// @ts-expect-error The output is typed: sequence is a number.
export const wrong: string = result.sequence;
