// The rule store is the definitions in force, not part of the event log, so a reset keeps it, and
// the reset seed lays the snapshot's rules over it again. It also keeps the widenings you rejected
// or left to lapse, which a reset would otherwise ask about again.
export const ruleStoreTables = [
  'rule_versions',
  'rules',
  'rule_revisions',
  'definition_rules',
  'seeded_rules',
  'runtime_rules',
  'closed_rule_proposals',
] as const;
