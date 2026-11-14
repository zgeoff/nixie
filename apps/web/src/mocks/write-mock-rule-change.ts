import { store } from './store';

export type MockRuleChange =
  | { readonly action: 'remove'; readonly ruleID: string; readonly revision: number }
  | {
      readonly action: 'edit';
      readonly ruleID: string;
      readonly revision: number;
      readonly destinations: readonly string[];
    };

export type MockRuleChangeResult =
  | { readonly status: 'changed'; readonly revision: number }
  | { readonly status: 'refused'; readonly error: 'NOT_FOUND' }
  | { readonly status: 'refused'; readonly error: 'CONFLICT'; readonly revision: number }
  | {
      readonly status: 'refused';
      readonly error: 'NOT_ALLOWED';
      readonly reason: 'widens' | 'empty';
    };

// An owner's change of a rule, as the host takes it: only a change that leaves the rule no wider.
export async function writeMockRuleChange(change: MockRuleChange): Promise<MockRuleChangeResult> {
  const rule = store.rules.findFirst((query) => query.where({ ruleID: change.ruleID }));

  if (rule === undefined) {
    return { status: 'refused', error: 'NOT_FOUND' };
  }

  if (rule.revision !== change.revision) {
    return { status: 'refused', error: 'CONFLICT', revision: rule.revision };
  }

  if (change.action === 'remove') {
    if (rule.outcome !== 'allow') {
      return { status: 'refused', error: 'NOT_ALLOWED', reason: 'widens' };
    }

    await store.rules.delete((query) => query.where({ ruleID: change.ruleID }));

    return { status: 'changed', revision: rule.revision };
  }

  if (change.destinations.length === 0) {
    return { status: 'refused', error: 'NOT_ALLOWED', reason: 'empty' };
  }

  const isWider =
    rule.destinations.length === 0
      ? false
      : change.destinations.some((destination) => !rule.destinations.includes(destination));

  if (isWider) {
    return { status: 'refused', error: 'NOT_ALLOWED', reason: 'widens' };
  }

  const revision = rule.revision + 1;

  await store.rules.update(rule, {
    data: (draft) => {
      draft.destinations = [...change.destinations];
      draft.revision = revision;
    },
  });

  return { status: 'changed', revision };
}
