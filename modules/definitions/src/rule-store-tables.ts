// The rule store is the definitions in force, not part of the event log, so a reset keeps it, and
// the reset seed lays the snapshot's rules over it again.
export const ruleStoreTables = [
  'rule_versions',
  'rules',
  'rule_revisions',
  'definition_rules',
  'seeded_rules',
  'runtime_rules',
] as const;
