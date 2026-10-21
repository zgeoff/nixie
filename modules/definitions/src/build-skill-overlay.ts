import type { DefinitionsSkillOrigin, SkillRef } from './types';

export interface DefinitionsSkillRef {
  readonly name: string;
  readonly skillHash: string;
  readonly origin: DefinitionsSkillOrigin;
}

export interface WrittenSkill {
  readonly approvalID: string;
  readonly name: string;
  readonly skillHash: string;
  readonly base: DefinitionsSkillRef | null;
}

export interface OverlaidSkill extends SkillRef {
  readonly approvalID: string | null;
}

export interface SkillOverlay {
  readonly skills: readonly OverlaidSkill[];

  readonly conversationSkills: readonly string[];

  readonly adopted: readonly WrittenSkill[];

  readonly beneath: ReadonlyMap<string, DefinitionsSkillRef | null>;
}

export interface SkillOverlayInput {
  readonly skills: readonly DefinitionsSkillRef[];
  readonly conversationSkills: readonly string[];
  readonly written: readonly WrittenSkill[];
}

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
