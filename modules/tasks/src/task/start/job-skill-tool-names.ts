// The skill tools that a run holds when its definition lists skills. The write and vendor tools
// stay with the conversation, so a run reads and reloads skills and writes none.
export const jobSkillToolNames: readonly string[] = [
  'skill_read',
  'skill_reload',
  'skill_reload_all',
];
