import { definitionsFormats } from './definitions-formats';
import { findFormatBeforeSkills } from './find-format-before-skills';
import { isSkillUnlisted } from './is-skill-unlisted';
import type { SkillsLock } from './parse-skills-lock';
import { parseSkillsLock } from './parse-skills-lock';
import { skillsLockPath } from './skills-lock-path';
import { toSkillVendorBranch } from './to-skill-vendor-branch';
import type { DefinitionsChange, SkillVersion } from './types';

export type SkillLockEntry = SkillsLock[string];

export interface SkillVendor {
  readonly version: SkillVersion;
  readonly entry: Omit<SkillLockEntry, 'contentHash'>;
  readonly report: string;

  readonly existing: readonly string[];

  readonly lock: string | null;
  readonly manifest: string | null;
}

export type SkillVendorChange =
  | { readonly status: 'ok'; readonly change: DefinitionsChange }
  | { readonly status: 'refused'; readonly reason: string };

export function buildSkillVendorChange(vendor: SkillVendor): SkillVendorChange {
  const name = vendor.version.name;
  const folder = `skills/${name}`;
  const parsed = parseSkillsLock(vendor.lock ?? undefined);

  if (parsed.problems.length > 0) {
    return {
      status: 'refused',
      reason: `${skillsLockPath} on the base branch is not a valid lock file, so fix it first`,
    };
  }

  const entries = parsed.entries;
  const current = Object.hasOwn(entries, name) ? entries[name] : undefined;

  if (current === undefined && vendor.existing.length > 0) {
    return {
      status: 'refused',
      reason:
        `${folder} on the base branch holds a skill of yours with no lock entry, and a vendored ` +
        'skill would replace it; rename or remove that skill first',
    };
  }

  const files = new Map<string, string | null>();

  for (const path of vendor.existing) {
    files.set(`${folder}/${path}`, null);
  }

  for (const [path, text] of vendor.version.files) {
    files.set(`${folder}/${path}`, text);
  }

  const lock = { ...entries, [name]: { ...vendor.entry, contentHash: vendor.version.skillHash } };

  files.set(skillsLockPath, `${JSON.stringify(lock, null, 2)}\n`);

  const short = vendor.entry.commit.slice(0, 12);
  const repository = vendor.entry.source.replace(/^https:\/\/github\.com\//u, '');

  const title =
    current === undefined
      ? `Vendor the ${name} skill from ${repository} at ${short}`
      : `Update the vendored ${name} skill to ${repository} at ${short}`;

  return {
    status: 'ok',
    change: {
      branch: toSkillVendorBranch(name),
      title,
      message: title,
      body: `${[...buildNotes(vendor, current), vendor.report].join('\n\n')}\n`,
      files,
    },
  };
}

function buildNotes(vendor: SkillVendor, current: SkillLockEntry | undefined): readonly string[] {
  const name = vendor.version.name;
  const entry = vendor.entry;

  const notes = [
    `nixie copied the \`${name}\` skill from \`${entry.path}\` in ${entry.source} at commit \`${entry.commit}\`, and pinned it in ${skillsLockPath} with the content hash \`${vendor.version.skillHash}\`. The seed refuses the skill if its files ever differ from that hash.`,
    'Your merge is the review: read the files and the report below before you merge. Nothing in the report lets the skill in.',
  ];

  if (current !== undefined) {
    notes.push(
      `The change replaces the version pinned at commit \`${current.commit}\` in ${current.source}.`,
    );
  }

  const format = findFormatBeforeSkills(vendor.manifest);

  if (format !== null) {
    const skillsFormat = String(definitionsFormats.skills);

    notes.push(
      `nixie.yaml holds format ${String(format)}, and the seed applies skills only from format ${skillsFormat}, so set \`format: ${skillsFormat}\` in nixie.yaml with the merge to apply the skill.`,
    );
  }

  if (isSkillUnlisted(vendor.manifest, name)) {
    notes.push(
      `nixie.yaml lists the conversation's skills. Add \`${name}\` to that list to give the conversation the skill after the merge.`,
    );
  }

  return notes;
}
