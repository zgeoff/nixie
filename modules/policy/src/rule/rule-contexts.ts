export const ruleContexts = ['conversation', 'task', 'coding'] as const;

// The context a rules file wrote before a definition's task run matched `task`. The parser reads it
// as `task`.
export const legacyRuleContext = 'job';
