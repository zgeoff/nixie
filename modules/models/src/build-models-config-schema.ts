import type { HarnessCapability, HarnessID } from '@heynixie/wire';
import { harnessCapabilities } from '@heynixie/wire';
import { z } from 'zod';
import { checkHarnessFit } from './check-harness-fit';
import { modelRoles } from './model-roles';
import { roleNeeds } from './role-needs';
import type { HarnessProfile, ModelProfile, ModelsConfig, SelectableModel } from './types';

type HarnessCapabilities = Readonly<Record<HarnessID, ReadonlySet<HarnessCapability>>>;

// Each harness's profile schema names the harness under the key the union reads.
export type HarnessProfileSchema<Profile extends ModelProfile = HarnessProfile> =
  z.core.$ZodTypeDiscriminable & z.ZodType<Omit<Profile, 'id'>>;

// What the union reads from each harness definition.
export interface HarnessSchemaEntry<Profile extends ModelProfile = HarnessProfile> {
  readonly id: HarnessID;
  readonly profileSchema: HarnessProfileSchema<Profile>;
}

const profileIDSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*$/u, 'a profile ID is a lowercase slug');

const rolesSchema = z.strictObject({
  conversation: profileIDSchema.optional(),
  task: profileIDSchema.optional(),
  worker: profileIDSchema.optional(),
  checker: profileIDSchema.optional(),
  'memory-writer': profileIDSchema.optional(),
  'memory-consolidator': profileIDSchema.optional(),
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

const limitsSchema = z.strictObject({ taskRun: taskRunSchema.default(taskRunSchema.parse({})) });

export function buildModelsConfigSchema<Profile extends ModelProfile = HarnessProfile>(
  entries: readonly [HarnessSchemaEntry<Profile>, ...HarnessSchemaEntry<Profile>[]],
  capabilities: HarnessCapabilities = harnessCapabilities,
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
    .transform((config): ModelsConfig<Profile> => ({
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
