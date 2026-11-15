import { z } from 'zod';

export interface PolicyConfig {
  readonly consent: { readonly linkMaxAgeMs: number };
  readonly proposedRules: {
    readonly approvals: number;
    readonly windowDays: number;
    readonly quietDays: number;
  };
  readonly mandates: { readonly maxHours: number };
}

const millisecondsPerHour = 3_600_000;

export const policyConfigSchema = z
  .strictObject({
    consent: z
      .strictObject({
        link_max_age: z
          .number()
          .positive()
          .default(24)
          .describe(
            'Hours from when you typed a message. A message that a task passes on carries your consent for this long.',
          ),
      })
      .default({ link_max_age: 24 }),
    proposed_rules: z
      .strictObject({
        approvals: z
          .int()
          .positive()
          .default(3)
          .describe(
            'Approved answers to the same kind of call before nixie proposes an allow rule for it.',
          ),
        window_days: z
          .number()
          .positive()
          .default(30)
          .describe('Days back from now that those approved answers count.'),
        quiet_days: z
          .number()
          .positive()
          .default(30)
          .describe(
            'Days that Not now, or a proposal you left to lapse, keeps nixie from proposing a rule for the same kind of call again.',
          ),
      })
      .default({ approvals: 3, window_days: 30, quiet_days: 30 }),
    mandates: z
      .strictObject({
        max_hours: z
          .number()
          .positive()
          .default(24)
          .describe('The latest end of a mandate, in hours from the moment it is proposed.'),
      })
      .default({ max_hours: 24 }),
  })
  .transform((config): PolicyConfig => ({
    consent: { linkMaxAgeMs: config.consent.link_max_age * millisecondsPerHour },
    proposedRules: {
      approvals: config.proposed_rules.approvals,
      windowDays: config.proposed_rules.window_days,
      quietDays: config.proposed_rules.quiet_days,
    },
    mandates: { maxHours: config.mandates.max_hours },
  }));
