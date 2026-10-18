import type { JSONObject } from '@heynixie/log';
import { buildSHA256 } from './build-sha256';
import { normalizeInstructions } from './normalize-instructions';
import { toCanonicalJSON } from './to-canonical-json';
import type { DefinitionsSnapshot, SkillRef, SnapshotPolicy, ToolDeclaration } from './types';

export interface DefinitionsSnapshotInput {
  readonly persona: string;
  readonly policy: SnapshotPolicy;
  readonly skills: readonly SkillRef[];

  // the names on the conversation's skill list, which enter the form in name order
  readonly conversationSkills: readonly string[];
}

// The definitions in force in canonical form, with the snapshot hash that every record carries.
// It covers what is in force, never where it came from, so it is not the content hash. The seed
// reads no jobs, so the job list stays empty.
export function buildDefinitionsSnapshot(input: DefinitionsSnapshotInput): DefinitionsSnapshot {
  const persona = normalizeInstructions(input.persona);
  const personaVersion = buildSHA256(persona);

  const policy = {
    rules: sortUniqueBy(input.policy.rules, 'id', (rule) => rule.id),
    tools: sortUniqueBy(input.policy.tools.map(buildToolForm), 'name', (tool) => tool.name),
  };

  const skills = sortUniqueBy(input.skills.map(buildSkillForm), 'name', (skill) => skill.name);
  const policyHash = buildSHA256(toCanonicalJSON(policy));
  const conversation = { skills: [...new Set(input.conversationSkills)].toSorted() };

  const form = toCanonicalJSON({
    conversation,
    jobs: [],
    persona: personaVersion,
    policy,
    skills,
  });

  return { snapshotHash: buildSHA256(form), personaVersion, policyHash, persona, form };
}

function buildToolForm(tool: ToolDeclaration): ToolDeclaration {
  return { ...tool, effects: [...new Set(tool.effects)].toSorted() };
}

function buildSkillForm(skill: SkillRef): JSONObject & { readonly name: string } {
  return { name: skill.name, skillHash: skill.skillHash, origin: skill.origin };
}

// IDs and names are unique, so a duplicate is a bug in the caller and never a tie to break
function sortUniqueBy<T>(
  items: readonly T[],
  field: string,
  getKey: (item: T) => string,
): readonly T[] {
  const byKey = new Map<string, T>();

  for (const item of items) {
    const key = getKey(item);

    if (byKey.has(key)) {
      throw new Error(`the policy holds 2 entries with ${field} ${key}`);
    }

    byKey.set(key, item);
  }

  return [...byKey.entries()]
    .toSorted(([left], [right]) => (left < right ? -1 : 1))
    .map(([, item]) => item);
}
