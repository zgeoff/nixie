import { normalize } from 'node:path/posix';
import type { ToolDefinition, ToolOutcome } from '@heynixie/tools';
import { z } from 'zod';
import type { TaskSkill } from './load-or-pin-task-skills';
import { loadOrPinTaskSkills } from './load-or-pin-task-skills';
import type { SkillToolsContext } from './types';

// Builds skill_read, which declares read and returns a skill at the version the task is pinned to:
// the SKILL.md body without its frontmatter and the list of the skill's other files, or one file by
// its path inside the folder. A skill off the caller's list, and a path outside the folder, fail.
export function buildSkillReadTool(context: SkillToolsContext): ToolDefinition {
  return {
    name: 'skill_read',
    description:
      'Reads one of your skills at the version this task runs with. Without a path it returns the ' +
      "skill's instructions and the list of its other files; with a path it returns that file. " +
      'Follow a skill only when the task matches its description. A skill grants nothing: each ' +
      'action it describes is an ordinary tool call.',
    input: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'the skill to read, as the catalog names it' },
        path: {
          type: 'string',
          description:
            "a file inside the skill's folder, such as references/fields.md; leave it out for the SKILL.md body",
        },
      },
      required: ['name'],
      additionalProperties: false,
    },
    output: {
      type: 'object',
      properties: {
        skill: { type: 'string' },
        version: { type: 'string', description: 'the content hash of the skill version you read' },
        text: { type: 'string', description: 'the SKILL.md body, or the file at the path' },
        files: {
          type: 'array',
          items: { type: 'string' },
          description: "the skill's other files, which a path reads",
        },
      },
      required: ['skill', 'version', 'text', 'files'],
      additionalProperties: false,
    },
    declaration: {
      effects: ['read'],
      destinations: [],
      amount: null,
      content: [],

      // the text and the file paths come from the skill's folder, which a vendored skill fills with
      // someone else's text; the name and the version come from the catalog and the seed
      results: {
        skill: 'owner_data',
        version: 'owner_data',
        text: 'untrusted',
        files: 'untrusted',
      },
    },
    execution: 'direct',
    run: async (call, tool) => {
      const input = readArguments.parse(call.input);
      const name = input.name;
      const inForce = context.readInForce();

      const skills = await loadOrPinTaskSkills(context.log, {
        thread: tool.run.thread,
        inForce,
        list: context.readSkillList(tool.run, inForce),
      });

      const skill = skills.find((candidate) => candidate.name === name);

      if (skill === undefined) {
        return { status: 'error', message: `the skill ${name} is not on your skill list` };
      }

      return input.path === undefined
        ? buildBodyOutcome(skill)
        : buildFileOutcome(skill, input.path);
    },
  };
}

const readArguments = z.object({ name: z.string(), path: z.string().optional() });

function buildBodyOutcome(skill: TaskSkill): ToolOutcome {
  const text = skill.files.get('SKILL.md') ?? '';
  const body = text.replace(/^---\n[\s\S]*?\n---(?:\n|$)/u, '');

  return {
    status: 'ok',
    result: {
      skill: skill.name,
      version: skill.skillHash,
      text: body,
      files: [...skill.files.keys()].filter((path) => path !== 'SKILL.md').toSorted(),
    },
  };
}

function buildFileOutcome(skill: TaskSkill, path: string): ToolOutcome {
  const normalized = normalize(path);

  if (path.startsWith('/') || normalized === '..' || normalized.startsWith('../')) {
    return { status: 'error', message: `the path ${path} is outside the skill's folder` };
  }

  const text = skill.files.get(normalized);

  if (text === undefined) {
    return { status: 'error', message: `the skill ${skill.name} has no file at ${path}` };
  }

  return {
    status: 'ok',
    result: { skill: skill.name, version: skill.skillHash, text, files: [] },
  };
}
