import { definitionsFormats } from './definitions-formats';
import { findFormatBeforeSkills } from './find-format-before-skills';
import { isSkillUnlisted } from './is-skill-unlisted';
import { renderTemplate } from './render-template';
import { skillsLockPath } from './skills-lock-path';
import { skillsLockSchema } from './skills-lock-schema';
import { toSkillExportBranch } from './to-skill-export-branch';
import type { DefinitionsChange, SkillExportText, SkillVersion } from './types';

export interface SkillExport {
  readonly approvalID: string;
  readonly proposalID: string;
  readonly version: SkillVersion;
  readonly text: SkillExportText;

  readonly beneath: SkillVersion | null;
  readonly isBeneathVendored: boolean;

  readonly existing: readonly string[];

  readonly lock: string | null;
  readonly manifest: string | null;
}

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

  if (skillExport.beneath === null && isSkillUnlisted(skillExport.manifest, name)) {
    notes.push(
      `nixie.yaml lists the conversation's skills. Add \`${name}\` to that list to keep the skill in the conversation after the merge.`,
    );
  }

  const values = {
    skill: name,
    operation: skillExport.beneath === null ? 'add' : 'update',
    agent: skillExport.text.agentName ?? 'nixie',
    owner: skillExport.text.ownerName ?? 'the owner',
    approval: skillExport.approvalID,
    proposal: skillExport.proposalID,
  };

  const title =
    skillExport.text.title === null
      ? buildDefaultTitle(name, skillExport.beneath)
      : renderTemplate(skillExport.text.title, values);

  const notesText = notes.join('\n\n');

  if (skillExport.text.message === null) {
    return {
      branch: toSkillExportBranch(name),
      title,
      message: title,
      body: `${notesText}\n`,
      files,
    };
  }

  const message = renderTemplate(skillExport.text.message, { ...values, notes: notesText });

  return {
    branch: toSkillExportBranch(name),
    title,
    message: `${title}\n\n${message}`,
    body: message,
    files,
  };
}

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

function buildDefaultTitle(name: string, beneath: SkillVersion | null): string {
  return beneath === null
    ? `Add the ${name} skill that nixie wrote`
    : `Update the ${name} skill to the version nixie wrote`;
}
