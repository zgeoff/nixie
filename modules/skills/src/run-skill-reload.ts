import type { ToolOutcome, ToolRun } from '@heynixie/tools';
import { loadTaskSkills } from './load-task-skills';
import { planSkillReload } from './plan-skill-reload';
import { recordSkillReload } from './record-skill-reload';
import type { SkillToolsContext } from './types';

// Runs a reload for a skill tool: it seeds a fresh snapshot, moves one named skill, or with no name
// every skill, to the version then in force, and records each skill's old and new hash. A name
// that is neither pinned nor on the caller's list fails.
export async function runSkillReload(
  context: SkillToolsContext,
  run: ToolRun,
  name: string | null,
): Promise<ToolOutcome> {
  const inForce = await context.refreshDefinitions();

  if (inForce === null) {
    return { status: 'error', message: 'no definitions are in force yet' };
  }

  const list = context.readSkillList(run, inForce);

  const skills = await loadTaskSkills(context.log, { thread: run.thread, inForce, list });

  if (name !== null && !list.includes(name) && !skills.some((skill) => skill.name === name)) {
    return { status: 'error', message: `the skill ${name} is not on your skill list` };
  }

  const plan = planSkillReload({
    pinned: skills.map((skill) => ({
      name: skill.name,
      skillHash: skill.skillHash,
      origin: skill.origin,
    })),
    inForce,
    list,
    name,
  });

  await recordSkillReload(context.log, { thread: run.thread, inForce, plan });

  return {
    status: 'ok',
    result: {
      skills: plan.changes.map((change) => ({
        name: change.name,
        oldVersion: change.oldHash,
        newVersion: change.newHash,
      })),
    },
  };
}

// the result of both reload tools: each skill's version before and after, null for none
export const reloadOutput = {
  type: 'object',
  properties: {
    skills: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          oldVersion: { type: ['string', 'null'] },
          newVersion: { type: ['string', 'null'] },
        },
        required: ['name', 'oldVersion', 'newVersion'],
        additionalProperties: false,
      },
    },
  },
  required: ['skills'],
  additionalProperties: false,
};
