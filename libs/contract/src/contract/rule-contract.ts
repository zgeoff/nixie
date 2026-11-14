import { z } from 'zod';
import { reusedIDErrors } from './reused-id-errors';
import { signedIn } from './signed-in';

const ruleIDSchema = z.string().min(1).max(200);
const revisionSchema = z.int().positive();

const ruleSchema = z.object({
  ruleID: z.string(),
  revision: revisionSchema,
  sentence: z.string(),
  outcome: z.enum(['allow', 'ask', 'deny']),
  destinations: z.array(z.string()),
});

const notFound = { NOT_FOUND: { message: 'No rule has this ID', status: 404 } };

const ruleChange = signedIn.errors(reusedIDErrors).errors({
  ...notFound,
  CONFLICT: {
    message: 'The rule changed since the notice showed it',
    status: 409,
    data: z.object({ revision: revisionSchema }),
  },
  NOT_ALLOWED: {
    message: 'The rule takes no such change',
    status: 403,
    data: z.object({ reason: z.enum(['widens', 'empty']) }),
  },
});

const destinationsSchema = z.array(z.string().regex(/^\S+$/u)).max(100);

export const ruleContract = {
  readRule: signedIn
    .errors(notFound)
    .input(z.object({ ruleID: ruleIDSchema }))
    .output(ruleSchema),

  removeRule: ruleChange
    .input(z.object({ ruleID: ruleIDSchema, revision: revisionSchema, clientActionID: z.uuid() }))
    .output(z.object({ ruleID: z.string() })),

  editRule: ruleChange
    .input(
      z.object({
        ruleID: ruleIDSchema,
        revision: revisionSchema,
        destinations: destinationsSchema,
        clientActionID: z.uuid(),
      }),
    )
    .output(z.object({ ruleID: z.string(), revision: revisionSchema })),
};
