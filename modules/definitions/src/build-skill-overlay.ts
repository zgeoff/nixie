import type { DefinitionsSkillOrigin, SkillRef } from './types';

// A skill in your definitions, by its name, its version and where it came from.
export interface DefinitionsSkillRef {
  readonly name: string;
  readonly skillHash: string;
  readonly origin: DefinitionsSkillOrigin;
}

// A skill that nixie wrote and an approval put in force, with the version of it in your definitions
// when the approval applied it, or null when your definitions lacked it.
export interface WrittenSkill {
  readonly approvalID: string;
  readonly name: string;
  readonly skillHash: string;
  readonly base: DefinitionsSkillRef | null;
}

// A skill in force, with the approval that applied it when nixie wrote it.
export interface OverlaidSkill extends SkillRef {
  readonly approvalID: string | null;
}

export interface SkillOverlay {
  // every skill in force, in name order
  readonly skills: readonly OverlaidSkill[];

  // the names on the conversation's skill list, in name order
  readonly conversationSkills: readonly string[];

  // each written skill whose version your definitions now hold, which the seed marks as yours
  readonly adopted: readonly WrittenSkill[];

  // the version in your definitions under each written skill that stays in force, or null when
  // your definitions lack the skill
  readonly beneath: ReadonlyMap<string, DefinitionsSkillRef | null>;
}

// your definitions' skills and conversation list, and the written skills in force
export interface SkillOverlayInput {
  readonly skills: readonly DefinitionsSkillRef[];
  readonly conversationSkills: readonly string[];
  readonly written: readonly WrittenSkill[];
}

// Lays each skill that nixie wrote over your definitions, in the list place of the version it
// replaces; a new one joins the conversation's list. A written skill whose version your
// definitions hold leaves the overlay as adopted.
export function buildSkillOverlay(input: SkillOverlayInput): SkillOverlay {
  const byName = new Map<string, OverlaidSkill>(
    input.skills.map((skill) => [
      skill.name,
      { name: skill.name, skillHash: skill.skillHash, origin: skill.origin, approvalID: null },
    ]),
  );

  const conversation = new Set(input.conversationSkills);

  const adopted: WrittenSkill[] = [];

  const beneath = new Map<string, DefinitionsSkillRef | null>();

  for (const written of input.written) {
    const definitions = input.skills.find((skill) => skill.name === written.name) ?? null;

    if (definitions?.skillHash === written.skillHash) {
      adopted.push(written);
      continue;
    }

    beneath.set(written.approvalID, definitions);

    byName.set(written.name, {
      name: written.name,
      skillHash: written.skillHash,
      origin: 'nixie',
      approvalID: written.approvalID,
    });

    if (definitions === null) {
      conversation.add(written.name);
    }
  }

  return {
    skills: [...byName.values()].toSorted((left, right) => (left.name < right.name ? -1 : 1)),
    conversationSkills: [...conversation].toSorted(),
    adopted,
    beneath,
  };
}
