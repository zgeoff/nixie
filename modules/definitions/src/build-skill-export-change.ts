import { z } from 'zod';
import { definitionsFormats } from './definitions-formats';
import { manifestSkillsSchema } from './manifest-skills-schema';
import { skillsLockPath } from './skills-lock-path';
import { skillsLockSchema } from './skills-lock-schema';
import { toSkillExportBranch } from './to-skill-export-branch';
import type { DefinitionsChange, SkillVersion } from './types';

// A skill that nixie wrote and an approval put in force, with what the base branch of your
// definitions repo holds for it.
export interface SkillExport {
  readonly approvalID: string;
  readonly proposalID: string;
  readonly version: SkillVersion;

  // the version in your definitions that it replaces, or null when they lack the skill
  readonly beneath: SkillVersion | null;
  readonly isBeneathVendored: boolean;

  // the path of each file in the skill's folder on the base branch, from the folder
  readonly existing: readonly string[];

  // the text of the lock file and of nixie.yaml on the base branch, each null when it is missing
  readonly lock: string | null;
  readonly manifest: string | null;
}

// Builds the change that carries a skill nixie wrote to your definitions repo: its files in its
// folder, the removal of each file the folder holds and it lacks, and the removal of a vendored
// skill's lock entry, so the seed after the merge reads the folder as your own skill.
export function buildSkillExportChange(skillExport: SkillExport): DefinitionsChange {
  const name = skillExport.version.name;
  const folder = `skills/${name}`;

  const files = new Map<string, string | null>();

  for (const path of skillExport.existing) {
    files.set(`${folder}/${path}`, null);
  }

  for (const [path, text] of skillExport.version.files) {
    files.set(`${folder}/${path}`, text);
  }

  const lock = skillExport.isBeneathVendored ? buildUnlocked(skillExport.lock, name) : null;

  if (lock !== null) {
    files.set(skillsLockPath, lock);
  }

  const format = findFormatBeforeSkills(skillExport.manifest);
  const skillsFormat = String(definitionsFormats.skills);

  const notes = [
    `nixie wrote this version of the \`${name}\` skill, and an approval put it in force: approval \`${skillExport.approvalID}\`, proposal \`${skillExport.proposalID}\`.`,
    format === null
      ? 'Merge this pull request to make the skill yours: the next seed after the merge marks it as yours. A change to the skill on the base branch before the merge shows as a conflict, and `nixie skill resolve` keeps one side.'
      : `nixie.yaml holds format ${String(format)}, and the seed applies skills only from format ${skillsFormat}, so a merge alone leaves the skill unapplied and nixie's version stays in force. Set \`format: ${skillsFormat}\` in nixie.yaml with the merge to make the skill yours: the next seed then marks it as yours. Format ${skillsFormat} applies and checks every skill under skills/.`,
  ];

  if (lock !== null) {
    notes.push(`The change removes the lock entry of the vendored \`${name}\` skill it replaces.`);
  }

  if (skillExport.beneath === null && isUnlisted(skillExport.manifest, name)) {
    notes.push(
      `nixie.yaml lists the conversation's skills. Add \`${name}\` to that list to keep the skill in the conversation after the merge.`,
    );
  }

  return {
    branch: toSkillExportBranch(name),
    title:
      skillExport.beneath === null
        ? `Add the ${name} skill that nixie wrote`
        : `Update the ${name} skill to the version nixie wrote`,
    body: `${notes.join('\n\n')}\n`,
    files,
  };
}

// the lock file without the skill's entry, or null when it holds no entry for the skill
function buildUnlocked(lock: string | null, name: string): string | null {
  if (lock === null) {
    return null;
  }

  const parsed = skillsLockSchema.safeParse(parseJSON(lock));

  if (!parsed.success) {
    throw new Error(`${skillsLockPath} on the base branch is not a valid lock file`);
  }

  if (!Object.hasOwn(parsed.data, name)) {
    return null;
  }

  const entries = Object.entries(parsed.data).filter(([entryName]) => entryName !== name);

  return `${JSON.stringify(Object.fromEntries(entries), null, 2)}\n`;
}

function parseJSON(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const manifestFormatSchema = z.looseObject({ format: z.number() });

// the format that nixie.yaml holds when the seed under it applies no skill, or null
function findFormatBeforeSkills(manifest: string | null): number | null {
  if (manifest === null) {
    return null;
  }

  const parsed = manifestFormatSchema.safeParse(parseYAML(manifest));

  return parsed.success && parsed.data.format < definitionsFormats.skills
    ? parsed.data.format
    : null;
}

function parseYAML(text: string): unknown {
  try {
    return Bun.YAML.parse(text);
  } catch {
    return null;
  }
}

// whether nixie.yaml lists the conversation's skills without the skill, which a merge alone then
// leaves off the conversation's list
function isUnlisted(manifest: string | null, name: string): boolean {
  if (manifest === null) {
    return false;
  }

  const parsed = manifestSkillsSchema.safeParse(parseYAML(manifest));

  return parsed.success && parsed.data.skills !== undefined && !parsed.data.skills.includes(name);
}
