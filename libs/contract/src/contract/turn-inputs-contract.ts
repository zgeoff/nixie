import { oc } from '@orpc/contract';
import { z } from 'zod';
import { inputMissSchema } from './input-miss-schema';
import { loggedInputSchema } from './logged-input-schema';

const turnInputOn = z.strictObject({
  state: z.literal('on'),
  forMs: z.int().positive().nullable(),
});

const turnInputOff = z.strictObject({ state: z.literal('off'), drop: z.boolean() });
const turnInputSetSchema = z.discriminatedUnion('state', [turnInputOn, turnInputOff]);

const turnInputs = oc.errors({
  NOT_FOUND: { message: 'no logged request has that ID', status: 404 },
  REMOVED: { message: 'that request is removed or its body is missing', status: 410 },
  OPEN_NOT_RECORDED: {
    message: 'the opening could not be recorded, so no body is read',
    status: 503,
  },
  NOT_CONFIGURED: { message: 'the turn-input log is not configured', status: 409 },
});

const listedInputsSchema = z.object({
  inputs: z.array(loggedInputSchema),
  misses: z.array(inputMissSchema),
});

export const turnInputsContract = {
  // newest first: each request's row and each miss. Not an opening.
  list: turnInputs
    .input(z.strictObject({ limit: z.int().positive().max(500).default(50) }))
    .output(listedInputsSchema),

  // OPEN_NOT_RECORDED: the model.input_opened commit failed, so no body
  open: turnInputs
    .input(z.strictObject({ inputID: z.string().min(1) }))
    .output(z.object({ inputID: z.string(), body: z.base64() })),

  set: turnInputs
    .input(turnInputSetSchema)
    .output(z.object({ state: z.enum(['on', 'off']), until: z.number().nullable() })),
};
