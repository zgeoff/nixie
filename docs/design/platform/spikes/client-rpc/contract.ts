/* oxlint-disable one-var -- schemas read better one per statement */
// The contract the web client and the Expo app share. It imports only @orpc/contract and zod,
// so a client bundle carries no server code.
import { eventIterator, oc } from '@orpc/contract';
import { z } from 'zod';

const spanSource = z.enum(['typed', 'pasted', 'dropped', 'unknown']);

const spanSchema = z.object({
  end: z.number().int(),
  source: spanSource,
  start: z.number().int(),
});

export const recordSchema = z.object({
  kind: z.string(),
  sequence: z.number().int(),
  text: z.string(),
  thread: z.string(),
});

export type LogRecord = z.infer<typeof recordSchema>;

export const contract = {
  approvals: {
    // A checked action: the client echoes the hash of the action it rendered.
    approve: oc
      .errors({ CONFLICT: { message: 'The action changed since it was shown' } })
      .input(z.object({ actionHash: z.string(), proposalId: z.string() }))
      .output(z.object({ approvalSequence: z.number().int() })),
  },
  conversation: {
    send: oc
      .input(
        z.object({
          clientMessageId: z.string(),
          spans: z.array(spanSchema),
          text: z.string(),
          thread: z.string(),
        }),
      )
      .output(z.object({ duplicate: z.boolean(), sequence: z.number().int() })),
  },
  log: {
    // Follows the log by sequence; the event id carries the sequence so a reconnect resumes.
    follow: oc.input(z.object({ after: z.number().int() })).output(eventIterator(recordSchema)),
  },
};
