import type { HarnessCapability, HarnessID } from '@heynixie/wire';
import { harnessCapabilities } from '@heynixie/wire';
import { z } from 'zod';
import { modelRoles } from '../role/model-roles';
import { roleNeeds } from '../role/role-needs';
import type {
  HarnessProfile,
  ModelProfile,
  ModelsConfig,
  ProfileFields,
  SelectableModel,
} from '../types';
import { bindHarness } from './bind-harness';
import { checkHarnessFit } from './check-harness-fit';

type HarnessCapabilities = Readonly<Record<HarnessID, ReadonlySet<HarnessCapability>>>;

// Each harness's profile schema names the harness under the key the union reads.
export type HarnessProfileSchema<Profile extends ModelProfile = HarnessProfile> =
  z.core.$ZodTypeDiscriminable & z.ZodType<ProfileFields<Profile>>;

export interface HarnessSchemaEntry {
  readonly id: HarnessID;
  readonly profileSchema: HarnessProfileSchema;
}

const profileIDSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*$/u, 'a profile ID is a lowercase slug');

const rolesSchema = z.strictObject({
  conversation: profileIDSchema.optional(),
  task: profileIDSchema.optional(),
  worker: profileIDSchema.optional(),
  checker: profileIDSchema.optional(),
  call: profileIDSchema.optional(),
});

const selectableSchema = z.strictObject({
  profile: profileIDSchema,
  description: z.string().trim().min(1).max(200),
  ask: z.boolean().optional(),
});

const turnsSchema = z.int().positive();
const dollarsSchema = z.number().positive();

const taskRunSchema = z
  .strictObject({
    default: z
      .strictObject({ turns: turnsSchema.default(25), dollars: dollarsSchema.default(2) })
      .default({ turns: 25, dollars: 2 }),
    max: z
      .strictObject({ turns: turnsSchema.default(100), dollars: dollarsSchema.default(10) })
      .default({ turns: 100, dollars: 10 }),
  })
  .superRefine((limits, issues) => {
    for (const key of ['turns', 'dollars'] as const) {
      if (limits.default[key] > limits.max[key]) {
        issues.addIssue({
          code: 'custom',
          path: ['default', key],
          message: `the default task run limit of ${String(limits.default[key])} ${key} is above its max of ${String(limits.max[key])}`,
        });
      }
    }
  });

const workerRunDefaults = { minutes: 10, turns: 25, tokens: 2_000_000, dollars: 2 };

const workerRunSchema = z.strictObject({
  minutes: z.number().positive().default(workerRunDefaults.minutes),
  turns: turnsSchema.default(workerRunDefaults.turns),
  tokens: z.int().positive().default(workerRunDefaults.tokens),
  dollars: dollarsSchema.default(workerRunDefaults.dollars),
});

const daySchema = z
  .strictObject({
    dollars: dollarsSchema.default(60),
    tokens: z.int().positive().default(80_000_000),
    turns: turnsSchema.default(1000),
    turnCap: turnsSchema.optional(),
  })
  .transform((day) => ({ ...day, turnCap: day.turnCap ?? day.turns * 2 }))
  .superRefine((day, issues) => {
    if (day.turnCap < day.turns) {
      issues.addIssue({
        code: 'custom',
        path: ['turnCap'],
        message: `the day's turn cap of ${String(day.turnCap)} is below its limit of ${String(day.turns)} turns`,
      });
    }
  });

const monthSchema = z.strictObject({
  dollars: dollarsSchema.default(600),
  tokens: z.int().positive().default(600_000_000),
  turns: turnsSchema.default(20_000),
});

const limitsSchema = z.strictObject({
  taskRun: taskRunSchema.default(taskRunSchema.parse({})),
  workerRun: workerRunSchema.default(workerRunSchema.parse({})),
  day: daySchema.default(daySchema.parse({})),
  month: monthSchema.default(monthSchema.parse({})),
});

type ReadToolCallWaitMs = (profile: HarnessProfile) => number | null;

export function buildModelsConfigSchema(
  entries: readonly [HarnessSchemaEntry, ...HarnessSchemaEntry[]],
  capabilities: HarnessCapabilities = harnessCapabilities,
  readToolCallWaitMs: ReadToolCallWaitMs = readHarnessToolCallWaitMs,
) {
  const [first, ...rest] = entries;
  const ids = entries.map((entry) => entry.id);

  // zod builds a union only from a tuple, so the first entry leads it.
  const profileSchema = z.discriminatedUnion(
    'harness',
    [first.profileSchema, ...rest.map((entry) => entry.profileSchema)],
    { error: (issue) => formatHarnessIssue(issue.path ?? [], issue.input, ids) },
  );

  return z
    .strictObject({
      profiles: z.record(profileIDSchema, profileSchema),
      roles: rolesSchema,
      selectable: z.record(profileIDSchema, selectableSchema).default({}),
      limits: limitsSchema.default(limitsSchema.parse({})),
    })
    .superRefine((config, issues) => {
      if (config.roles.conversation === undefined) {
        issues.addIssue({
          code: 'custom',
          path: ['roles', 'conversation'],
          message: 'the conversation role is unset, and nixie needs it to start',
        });
      }

      for (const [role, profileID] of Object.entries(config.roles)) {
        if (profileID !== undefined && !Object.hasOwn(config.profiles, profileID)) {
          issues.addIssue({
            code: 'custom',
            path: ['roles', role],
            message: `the ${role} role names the profile ${profileID}, which is not defined`,
          });
        }
      }

      // A task on a selectable model counts its cost against its dollar limit, so its profile needs
      // a price table.
      for (const [name, entry] of Object.entries(config.selectable)) {
        const profile = config.profiles[entry.profile];

        if (profile === undefined) {
          issues.addIssue({
            code: 'custom',
            path: ['selectable', name, 'profile'],
            message: `the selectable model ${name} names the profile ${entry.profile}, which is not defined`,
          });
        } else if (profile.prices === null) {
          issues.addIssue({
            code: 'custom',
            path: ['selectable', name, 'profile'],
            message: `the selectable model ${name} names the profile ${entry.profile}, which sets no prices`,
          });
        } else {
          addMisfitIssue(issues, {
            path: ['selectable', name, 'profile'],
            subject: `the selectable model ${name}`,
            profileID: entry.profile,
            profile,
            needs: roleNeeds.task,
            capabilities,
          });
        }
      }

      // A task counts its cost against its dollar limit, and an unset task role runs on the
      // conversation's profile, so the profile a task runs on needs a price table.
      const taskProfileID = config.roles.task ?? config.roles.conversation;
      const taskProfile = taskProfileID === undefined ? undefined : config.profiles[taskProfileID];

      if (taskProfile?.prices === null) {
        issues.addIssue({
          code: 'custom',
          path: ['roles', 'task'],
          message:
            config.roles.task === undefined
              ? `the task role is unset, so tasks run on the conversation's profile ${taskProfileID ?? ''}, which sets no prices`
              : `the task role names the profile ${config.roles.task}, which sets no prices`,
        });
      }

      addWorkerIssues(issues, config, readToolCallWaitMs);

      // A check removes no block of the CLI, so a profile outside Claude cannot run it.
      const checkerProfileID = config.roles.checker ?? config.roles.conversation;

      const checkerProfile =
        checkerProfileID === undefined ? undefined : config.profiles[checkerProfileID];

      if (
        checkerProfileID !== undefined &&
        checkerProfile !== undefined &&
        bindHarness({ id: checkerProfileID, ...checkerProfile }).rewritesRequests
      ) {
        issues.addIssue({
          code: 'custom',
          path: ['roles', 'checker'],
          message: `the checker role runs on the profile ${checkerProfileID}, which is outside Claude, and a check removes no CLI block`,
        });
      }

      // A role left unset runs on the conversation's profile, so that profile must fit it too.
      for (const role of modelRoles) {
        const profileID = config.roles[role] ?? config.roles.conversation;
        const profile = profileID === undefined ? undefined : config.profiles[profileID];

        if (profileID !== undefined && profile !== undefined) {
          addMisfitIssue(issues, {
            path: ['roles', role],
            subject: `the ${role} role`,
            profileID,
            profile,
            needs: roleNeeds[role],
            capabilities,
          });
        }
      }
    })
    .transform((config): ModelsConfig => ({
      profiles: Object.fromEntries(
        Object.entries(config.profiles).map(([id, profile]) => [id, { id, ...profile }]),
      ),
      roles: {
        ...Object.fromEntries(
          Object.entries(config.roles).filter(([, profileID]) => profileID !== undefined),
        ),
        conversation: config.roles.conversation ?? '',
      },
      selectable: Object.entries(config.selectable).map(([name, entry]): SelectableModel => ({
        name,
        profile: entry.profile,
        description: entry.description,
        isAsked: entry.ask ?? false,
      })),
      limits: config.limits,
    }));
}

function readHarnessToolCallWaitMs(profile: HarnessProfile): number | null {
  return bindHarness(profile).toolCallWaitMs;
}

function formatHarnessIssue(
  path: readonly PropertyKey[],
  input: unknown,
  ids: readonly HarnessID[],
): string {
  const profileID = String(path.at(-2) ?? '');
  const harness = z.object({ harness: z.string() }).safeParse(input).data?.harness;

  const choices = new Intl.ListFormat('en', { type: 'disjunction' }).format(
    ids.map((id) => `harness: ${id}`),
  );

  return harness === undefined
    ? `the profile ${profileID} names no harness; add ${choices}`
    : `the profile ${profileID} names the harness ${harness}, which nixie does not run; use ${choices}`;
}

interface MisfitCheck {
  readonly path: readonly PropertyKey[];
  readonly subject: string;
  readonly profileID: string;
  readonly profile: Pick<ModelProfile, 'harness'>;
  readonly needs: ReadonlySet<HarnessCapability>;
  readonly capabilities: HarnessCapabilities;
}

function addMisfitIssue(issues: z.core.$RefinementCtx, check: MisfitCheck): void {
  const fit = checkHarnessFit(check.profile, check.needs, check.capabilities);

  if (!fit.fits) {
    issues.addIssue({
      code: 'custom',
      path: [...check.path],
      message: `${check.subject} runs on the profile ${check.profileID}, whose ${check.profile.harness} harness lacks ${fit.missing.join(', ')}`,
    });
  }
}

// A worker's limit error has to reach its caller before the runtime gives up on the call.
const workerWaitMarginMs = 30_000;

interface WorkerConfig {
  readonly profiles: Readonly<Record<string, ProfileFields>>;
  readonly roles: z.infer<typeof rolesSchema>;
  readonly selectable: Readonly<Record<string, z.infer<typeof selectableSchema>>>;
  readonly limits: z.infer<typeof limitsSchema>;
}

// The worker role takes these checks and no other config does, because without it no tool starts a
// worker.
function addWorkerIssues(
  issues: z.core.$RefinementCtx,
  config: WorkerConfig,
  readToolCallWaitMs: ReadToolCallWaitMs,
): void {
  const workerProfileID = config.roles.worker;

  if (workerProfileID === undefined) {
    return;
  }

  if (config.profiles[workerProfileID]?.prices === null) {
    issues.addIssue({
      code: 'custom',
      path: ['roles', 'worker'],
      message: `the worker role names the profile ${workerProfileID}, which sets no prices, and a worker run counts its cost against its dollar limit`,
    });
  }

  const callerIDs = new Set(
    [config.roles.conversation, config.roles.task ?? config.roles.conversation].filter(
      (id) => id !== undefined,
    ),
  );

  const minutes = config.limits.workerRun.minutes;

  for (const profileID of callerIDs) {
    const profile = config.profiles[profileID];

    if (profile === undefined) {
      continue;
    }

    const waitMs = readToolCallWaitMs({ id: profileID, ...profile });

    if (waitMs === null) {
      issues.addIssue({
        code: 'custom',
        path: ['roles', 'worker'],
        message: `the worker role is set, and the ${profile.harness} harness of the profile ${profileID} has no tool call wait, so a worker's limit error could miss its caller`,
      });
    } else if (minutes * 60_000 > waitMs - workerWaitMarginMs) {
      issues.addIssue({
        code: 'custom',
        path: ['limits', 'workerRun', 'minutes'],
        message: `the worker run limit of ${String(minutes)} minutes is longer than the ${String((waitMs - workerWaitMarginMs) / 60_000)} minutes that the ${profile.harness} harness of the profile ${profileID} gives a tool call (its wait of ${String(waitMs / 60_000)} minutes less 30 seconds)`,
      });
    }
  }

  // A selectable model that asks is no choice for a worker. Any other can run a worker, and its
  // profile can call one, so its harness needs the same wait.
  for (const [name, entry] of Object.entries(config.selectable)) {
    const profile = config.profiles[entry.profile];

    if (entry.ask === true || profile === undefined || callerIDs.has(entry.profile)) {
      continue;
    }

    const waitMs = readToolCallWaitMs({ id: entry.profile, ...profile });

    if (waitMs === null) {
      issues.addIssue({
        code: 'custom',
        path: ['selectable', name, 'profile'],
        message: `the worker role is set, and the ${profile.harness} harness of the profile ${entry.profile} of the selectable model ${name} has no tool call wait, so a worker's limit error could miss its caller`,
      });
    } else if (minutes * 60_000 > waitMs - workerWaitMarginMs) {
      issues.addIssue({
        code: 'custom',
        path: ['limits', 'workerRun', 'minutes'],
        message: `the worker run limit of ${String(minutes)} minutes is longer than the ${String((waitMs - workerWaitMarginMs) / 60_000)} minutes that the ${profile.harness} harness of the profile ${entry.profile} of the selectable model ${name} gives a tool call (its wait of ${String(waitMs / 60_000)} minutes less 30 seconds)`,
      });
    }
  }
}
