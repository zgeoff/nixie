import type { JSONObject } from '@heynixie/log';
import { buildSHA256 } from './build-sha256';
import { normalizeInstructions } from './normalize-instructions';
import { toCanonicalJSON } from './to-canonical-json';
import type { DefinitionsSnapshot, SkillRef, SnapshotPolicy, ToolDeclaration } from './types';

// a skill in force, with the approval that applied it when nixie wrote it
type SnapshotSkillInput = SkillRef & { readonly approvalID?: string | null };

export interface DefinitionsSnapshotInput {
  readonly persona: string;
  readonly policy: SnapshotPolicy;
  readonly skills: readonly SnapshotSkillInput[];

  // the names on the conversation's skill list, which enter the form in name order
  readonly conversationSkills: readonly string[];
}

// The definitions in force in canonical form, with the snapshot hash that every record carries.
// It covers what is in force and the approval behind each skill nixie wrote, never the source
// revision, so it is not the content hash. The seed reads no jobs, so the job list stays empty.
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

function buildToolForm(tool: ToolDeclaration): ToolDeclaration {
  return { ...tool, effects: [...new Set(tool.effects)].toSorted() };
}

// A skill nixie wrote names its approval, so a version that a later approval brings back gets a
// snapshot of its own and never the rows of the approval it superseded.
function buildSkillForm(skill: SnapshotSkillInput): JSONObject & { readonly name: string } {
  const form = { name: skill.name, skillHash: skill.skillHash, origin: skill.origin };

  return skill.approvalID === undefined || skill.approvalID === null
    ? form
    : { ...form, approvalID: skill.approvalID };
}
