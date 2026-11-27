import type { JSONObject } from '@heynixie/log';
import type { McpOverrides } from '@heynixie/policy';
import type { PromptOverrides } from '@heynixie/prompts';
import { definitionSections } from '../section/definition-sections';
import type {
  DefinitionBudget,
  DefinitionsSnapshot,
  SectionValues,
  SkillRef,
  SnapshotPolicy,
  SnapshotTask,
  SnapshotTasks,
  ToolDeclaration,
} from '../types';
import { buildSHA256 } from '../utils/build-sha256';
import { toCanonicalJSON } from '../utils/to-canonical-json';
import { toMcpOverridesForm } from '../utils/to-mcp-overrides-form';
import { normalizeInstructions } from './normalize-instructions';

type SnapshotSkillInput = SkillRef & { readonly approvalID?: string | null };

export interface DefinitionsSnapshotInput {
  readonly persona: string;
  readonly policy: SnapshotPolicy;
  readonly prompts: PromptOverrides;
  readonly skills: readonly SnapshotSkillInput[];

  readonly conversationSkills: readonly string[];
  readonly tasks: SnapshotTasks;

  // the budgets in force, which a raised limit joins only once you approve it
  readonly budgets?: readonly DefinitionBudget[];

  // the override files of the MCP proxy, by server ID, which a call of a proxied tool runs under
  readonly mcp?: McpOverrides;

  // the value of each section that a feature adds, which enters the snapshot only when held
  readonly sections?: SectionValues;
}

export function buildDefinitionsSnapshot(input: DefinitionsSnapshotInput): DefinitionsSnapshot {
  const persona = normalizeInstructions(input.persona);
  const personaVersion = buildSHA256(persona);

  const policy = {
    rules: sortUniqueBy(input.policy.rules, 'id', (rule) => rule.id),
    tools: sortUniqueBy(input.policy.tools.map(buildToolForm), 'name', (tool) => tool.name),
    places: sortUniqueBy(
      (input.policy.places ?? []).map((place) =>
        place.nameSequence === undefined
          ? { placeID: place.placeID, trust: place.trust }
          : { placeID: place.placeID, trust: place.trust, nameSequence: place.nameSequence },
      ),
      'placeID',
      (place) => place.placeID,
    ),
    consent: input.policy.consent ?? {},
  };

  const skills = sortUniqueBy(input.skills.map(buildSkillForm), 'name', (skill) => skill.name);
  const policyHash = buildSHA256(toCanonicalJSON(policy));
  const conversation = { skills: [...new Set(input.conversationSkills)].toSorted() };
  const prompts = buildPromptsForm(input.prompts);

  const tasks = sortUniqueBy(
    input.tasks.map((task) => buildTaskForm(task)),
    'id',
    (task) => task.id,
  );

  const budgets = sortUniqueBy(
    (input.budgets ?? []).map((budget) => ({
      id: budget.id,
      counts: budget.counts,
      limitMicros: budget.limitMicros,
      period: budget.period,
    })),
    'id',
    (budget) => budget.id,
  );

  const sections = input.sections ?? {};

  const form = toCanonicalJSON({
    conversation,
    persona: personaVersion,
    policy,
    skills,
    tasks,
    ...(Object.keys(prompts).length === 0 ? {} : { prompts }),
    ...(budgets.length === 0 ? {} : { budgets }),
    ...(Object.keys(input.mcp ?? {}).length === 0
      ? {}
      : { mcp: toMcpOverridesForm(input.mcp ?? {}) }),
    ...buildSectionForms(sections),
  });

  return {
    snapshotHash: buildSHA256(form),
    personaVersion,
    policyHash,
    persona,
    prompts: input.prompts,
    tasks,
    sections,
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

function buildTaskForm(task: SnapshotTask): SnapshotTask {
  return task.origin === 'nixie'
    ? { id: task.id, hash: task.hash, origin: 'nixie', changeID: task.changeID }
    : { id: task.id, hash: task.hash, origin: 'definitions' };
}

function buildSectionForms(sections: SectionValues): JSONObject {
  return Object.fromEntries(
    definitionSections
      .list()
      .flatMap((section) =>
        sections[section.key] === undefined
          ? []
          : [[section.key, section.toForm(sections[section.key])]],
      ),
  );
}
