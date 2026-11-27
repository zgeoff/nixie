import { z } from 'zod';

const wakeEventSchema = z.enum([
  'waiting',
  'idle',
  'ended',
  'gone',
  'progress',
  'blocked',
  'decision',
]);

const wakeSchema = z.strictObject({
  started: z
    .array(wakeEventSchema)
    .default(['waiting', 'idle', 'blocked', 'decision', 'ended', 'gone']),
  joined: z.array(wakeEventSchema).default(['waiting', 'ended', 'gone']),
});

const targetSchema = z.strictObject({ daemon: z.string().min(1), target: z.string().min(1) });

const atcSchema = z
  .strictObject({
    // the gateway's https URL, which the adapter calls under `/rpc`; a trailing `/mcp` is dropped
    url: z.url({ protocol: /^https$/u }),

    // the service client that the token belongs to, named in logs and errors
    principal: z.string().min(1),

    // the one key of the secrets file that holds the gateway's service token
    token: z.literal('deployment:atc_token'),
    targets: z.array(targetSchema).min(1),

    // '<daemon>/<target>', one of the targets
    defaultTarget: z.string().regex(/^[^/]+\/[^/]+$/u, 'use <daemon>/<target>'),
    agent: z.string().min(1).optional(),
  })
  .superRefine((atc, issues) => {
    const isListed = atc.targets.some(
      (target) => `${target.daemon}/${target.target}` === atc.defaultTarget,
    );

    if (!isListed) {
      issues.addIssue({
        code: 'custom',
        path: ['defaultTarget'],
        message: `${atc.defaultTarget} is not one of the targets`,
      });
    }
  });

// The coding section. A deployment that sets no `atc` block starts with no coding runner.
export const codingConfigSchema = z.strictObject({
  wake: wakeSchema.default(wakeSchema.parse({})),

  // how long coding.steer and coding.message wait for their action's outcome before they answer
  // that it is pending
  toolWaitMs: z.number().int().min(0).default(5000),
  atc: atcSchema.optional(),
});

export type CodingConfig = z.infer<typeof codingConfigSchema>;
