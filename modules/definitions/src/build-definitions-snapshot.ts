import type { JSONObject } from '@heynixie/log';
import type { PromptOverrides } from '@heynixie/prompts';
import { buildSHA256 } from './build-sha256';
import { normalizeInstructions } from './normalize-instructions';
import { toCanonicalJSON } from './to-canonical-json';
import type { DefinitionsSnapshot, SkillRef, SnapshotPolicy, ToolDeclaration } from './types';

type SnapshotSkillInput = SkillRef & { readonly approvalID?: string | null };

export interface DefinitionsSnapshotInput {
  readonly persona: string;
  readonly policy: SnapshotPolicy;
  readonly prompts: PromptOverrides;
  readonly skills: readonly SnapshotSkillInput[];

  readonly conversationSkills: readonly string[];
}

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
  const prompts = buildPromptsForm(input.prompts);

  const form = toCanonicalJSON({
    conversation,
    jobs: [],
    persona: personaVersion,
    policy,
    skills,
    ...(Object.keys(prompts).length === 0 ? {} : { prompts }),
  });

  return {
    snapshotHash: buildSHA256(form),
    personaVersion,
    policyHash,
    persona,
    prompts: input.prompts,
    form,
  };
}

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

function buildSkillForm(skill: SnapshotSkillInput): JSONObject & { readonly name: string } {
  const form = { name: skill.name, skillHash: skill.skillHash, origin: skill.origin };

  return skill.approvalID === undefined || skill.approvalID === null
    ? form
    : { ...form, approvalID: skill.approvalID };
}

function buildPromptsForm(prompts: PromptOverrides): JSONObject {
  return Object.fromEntries(
    Object.entries(prompts).flatMap(([id, override]) =>
      override === undefined ? [] : [[id, { parts: override.parts, template: override.template }]],
    ),
  );
}
