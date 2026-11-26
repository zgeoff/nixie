import type { ProfileFields } from '../types';

export interface PriceIssue {
  readonly path: readonly string[];
  readonly message: string;
}

export interface PricedModelsConfig {
  readonly profiles: Readonly<Record<string, Pick<ProfileFields, 'prices'>>>;
  readonly roles: {
    readonly conversation?: string | undefined;
    readonly task?: string | undefined;
    readonly worker?: string | undefined;
  };
  readonly selectable: readonly { readonly name: string; readonly profile: string }[];
}

// A task counts each model call against its dollar limit by the profile's prices, so each profile
// that a task, a selectable model or a worker runs on needs a price table.
export function collectMissingPriceIssues(config: PricedModelsConfig): PriceIssue[] {
  const issues: PriceIssue[] = [];

  const unpriced = new Set(
    Object.entries(config.profiles)
      .filter(([, profile]) => profile.prices === null)
      .map(([profileID]) => profileID),
  );

  for (const entry of config.selectable) {
    if (unpriced.has(entry.profile)) {
      issues.push({
        path: ['models', 'selectable', entry.name, 'profile'],
        message: `the selectable model ${entry.name} names the profile ${entry.profile}, which sets no prices`,
      });
    }
  }

  // an unset task role runs tasks on the conversation's profile
  const taskProfileID = config.roles.task ?? config.roles.conversation;

  if (taskProfileID !== undefined && unpriced.has(taskProfileID)) {
    issues.push({
      path: ['models', 'roles', 'task'],
      message:
        config.roles.task === undefined
          ? `the task role is unset, so tasks run on the conversation's profile ${taskProfileID}, which sets no prices`
          : `the task role names the profile ${taskProfileID}, which sets no prices`,
    });
  }

  if (config.roles.worker !== undefined && unpriced.has(config.roles.worker)) {
    issues.push({
      path: ['models', 'roles', 'worker'],
      message: `the worker role names the profile ${config.roles.worker}, which sets no prices, and a worker run counts its cost against its dollar limit`,
    });
  }

  return issues;
}

// With a gateway, the gateway prices each reply on its route, so a profile sets no prices. A table
// here would price the same reply a second time and drift from the route's.
export function collectGatewayPriceIssues(
  profiles: Readonly<Record<string, Pick<ProfileFields, 'prices'>>>,
): PriceIssue[] {
  return Object.entries(profiles)
    .filter(([, profile]) => profile.prices !== null)
    .map(([profileID]) => ({
      path: ['models', 'profiles', profileID, 'prices'],
      message: `the profile ${profileID} sets prices, and the spendStop section is set, so the model gateway prices each reply from the prices of its route: remove the profile's prices and set the route's prices in the gateway's config`,
    }));
}
