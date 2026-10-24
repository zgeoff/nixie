import type { DecisionModelName } from '../create-decision-model.ts';

const answers = new Map<DecisionModelName, number>();
const requests: { authorization: string | null; body: unknown; model: DecisionModelName; url: string }[] = [];

// The hosted decision models' state for the MSW handlers: the probability each one answers with,
// and every request it received. The test preload resets it after each test.
export const decisionStore = {
  answers,
  requests,
  reset: () => {
    answers.clear();
    requests.length = 0;
  },
};
