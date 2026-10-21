// The branch in your definitions repo that carries the export of a skill nixie wrote, one per skill.
export function toSkillExportBranch(name: string): string {
  return `nixie/skill/${name}`;
}
