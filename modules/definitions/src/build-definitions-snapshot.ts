import { buildSHA256 } from './build-sha256';
import { normalizeInstructions } from './normalize-instructions';
import { toCanonicalJSON } from './to-canonical-json';
import type { DefinitionsSnapshot, SnapshotPolicy, ToolDeclaration } from './types';

export interface DefinitionsSnapshotInput {
  readonly persona: string;
  readonly policy: SnapshotPolicy;
}

// The definitions in force in canonical form, with the snapshot hash that every record carries.
// It covers what is in force, never where it came from, so it is not the content hash. Slice 1
// seeds no jobs, so the job list stays empty.
export function buildDefinitionsSnapshot(input: DefinitionsSnapshotInput): DefinitionsSnapshot {
  const persona = normalizeInstructions(input.persona);
  const personaVersion = buildSHA256(persona);
  const policy = {
    rules: sortUniqueBy(input.policy.rules, 'id', (rule) => rule.id),
    tools: sortUniqueBy(input.policy.tools.map(buildToolForm), 'name', (tool) => tool.name),
  };
  const policyHash = buildSHA256(toCanonicalJSON(policy));
  const form = toCanonicalJSON({ jobs: [], persona: personaVersion, policy });

  return { snapshotHash: buildSHA256(form), personaVersion, policyHash, persona, form };
}

function buildToolForm(tool: ToolDeclaration): ToolDeclaration {
  return { ...tool, effects: [...new Set(tool.effects)].toSorted() };
}

// IDs and tool names are unique, so a duplicate is a bug in the caller and never a tie to break
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
