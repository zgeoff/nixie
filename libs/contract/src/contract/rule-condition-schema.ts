import { z } from 'zod';

// What a card shows for a rule with a condition. The host renders the words, so every client
// shows the same sentence.
export const ruleConditionSchema = z.object({
  note: z.string(),

  // 'you' for a rule from the definitions repo or from your edit through rules.editProposedRule;
  // 'nixie' for a rule nixie proposed through rules.propose_mandate
  noteBy: z.enum(['you', 'nixie']),

  // the condition as one sentence, such as "the hour in Europe/London is before 17, and ..."
  words: z.string(),

  // the raw CEL
  source: z.string(),
});

// A rule whose condition errored on a call, with the library's error code and never its message
export const conditionErrorSchema = z.object({
  ruleID: z.string(),
  revision: z.int().positive(),
  code: z.string(),
});
