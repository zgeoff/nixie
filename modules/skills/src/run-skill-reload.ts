import { waitForSettled } from '@heynixie/async';
import type { ToolOutcome, ToolRun } from '@heynixie/tools';
import invariant from 'tiny-invariant';
import { loadOrPinTaskSkills } from './load-or-pin-task-skills';
import { planSkillReload } from './plan-skill-reload';
import { recordSkillReload } from './record-skill-reload';
import type { SkillToolsContext } from './types';

export async function runSkillReload(
  context: SkillToolsContext,
  run: ToolRun,
  name: string | null,
): Promise<ToolOutcome> {
  const chains = registerReloadChains(context.log.writer);
  const reload = waitThenReload(chains.get(run.thread), context, run, name);
  const tail = waitForSettled(reload);

  chains.set(run.thread, tail);

  await tail;

  if (chains.get(run.thread) === tail) {
    chains.delete(run.thread);
  }

  return reload;
}

const reloadChains = new WeakMap<object, Map<string, Promise<void>>>();

function registerReloadChains(writer: object): Map<string, Promise<void>> {
  const chains = reloadChains.get(writer) ?? new Map<string, Promise<void>>();

  reloadChains.set(writer, chains);

  return chains;
}

async function waitThenReload(
  previous: Promise<void> | undefined,
  context: SkillToolsContext,
  run: ToolRun,
  name: string | null,
): Promise<ToolOutcome> {
  await previous;

  return runOneReload(context, run, name);
}

async function runOneReload(
  context: SkillToolsContext,
  run: ToolRun,
  name: string | null,
): Promise<ToolOutcome> {
  const inForce = await context.refreshDefinitions();

  if (inForce === null) {
    return { status: 'error', message: 'no definitions are in force yet' };
  }

  const list = context.readSkillList(run, inForce);

  const skills = await loadOrPinTaskSkills(context.log, { thread: run.thread, inForce, list });

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

  const isRecorded = await recordSkillReload(context.log, { thread: run.thread, inForce, plan });

  invariant(isRecorded);

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
