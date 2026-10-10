/* oxlint-disable one-var -- schemas read better one per statement */
// The contract the web client shares with nixie's API. It imports only @orpc/contract and zod, so
// the browser bundle carries no server code.
import { eventIterator, oc } from '@orpc/contract';
import { z } from 'zod';

export const taskSchema = z.object({ id: z.string(), status: z.string(), title: z.string() });

export const recordSchema = z.object({ sequence: z.number().int(), text: z.string() });

export const contract = {
  log: {
    follow: oc.input(z.object({ after: z.number().int() })).output(eventIterator(recordSchema)),
  },
  tasks: {
    list: oc.output(z.array(taskSchema)),
  },
  whoami: oc.output(z.object({ device: z.string(), sessionId: z.string(), via: z.string() })),
};
