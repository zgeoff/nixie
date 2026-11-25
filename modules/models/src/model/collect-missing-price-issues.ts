import type { ModelPrices, ProfileFields } from '../types';

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

// Without a gateway, nixie prices each model call itself, so each profile that a task, a selectable
// model or a worker runs on needs a price table. With a gateway, the route's prices are the one
// source and a profile sets none, so the caller skips this check.
export function collectMissingPriceIssues(config: PricedModelsConfig): PriceIssue[] {
  const issues: PriceIssue[] = [];

  for (const entry of config.selectable) {
    if (hasNoPrices(config, entry.profile)) {
      issues.push({
        path: ['models', 'selectable', entry.name, 'profile'],
        message: `the selectable model ${entry.name} names the profile ${entry.profile}, which sets no prices`,
      });
    }
  }

  // an unset task role runs tasks on the conversation's profile
  const taskProfileID = config.roles.task ?? config.roles.conversation;

  if (taskProfileID !== undefined && hasNoPrices(config, taskProfileID)) {
    issues.push({
      path: ['models', 'roles', 'task'],
      message:
        config.roles.task === undefined
          ? `the task role is unset, so tasks run on the conversation's profile ${taskProfileID}, which sets no prices`
          : `the task role names the profile ${taskProfileID}, which sets no prices`,
    });
  }

  if (config.roles.worker !== undefined && hasNoPrices(config, config.roles.worker)) {
    issues.push({
      path: ['models', 'roles', 'worker'],
      message: `the worker role names the profile ${config.roles.worker}, which sets no prices, and a worker run counts its cost against its dollar limit`,
    });
  }

  return issues;
}

function hasNoPrices(config: PricedModelsConfig, profileID: string): boolean {
  const prices: ModelPrices | null | undefined = config.profiles[profileID]?.prices;

  return prices === null;
}
