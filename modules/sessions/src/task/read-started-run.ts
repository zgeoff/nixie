import { codeRunToolName } from '@heynixie/connectors';
import type { Harness, ResolvedProfile } from '@heynixie/models';
import { bindHarness } from '@heynixie/models';
import type { GuestCommand } from '@heynixie/sandbox';
import type {
  CallTaskOptions,
  DefinitionRunContext,
  DefinitionVersion,
  StartedTaskSetup,
  TaskRunOptions,
} from '@heynixie/tasks';
import {
  callRunnerKey,
  jobSkillToolNames,
  readCallTask,
  readDefinitionRunContext,
  readTaskSetup,
  selfNoteToolNames,
  startedTaskDefaultTools,
} from '@heynixie/tasks';
import type { ToolRunModel } from '@heynixie/tools';
import invariant from 'tiny-invariant';
import { match } from 'ts-pattern';
import { buildGuestCommand } from './build-guest-command';
import type { SystemTaskSession } from './make-system-task-runner';
import { pickCallTools } from './pick-call-tools';
import type { SandboxRunnerOptions } from './sandbox-runner-options';

export interface RunReader {
  readonly options: SandboxRunnerOptions;
  readonly session: SystemTaskSession;
  readonly profiles: Readonly<Record<string, ResolvedProfile>>;
}

export interface StartedRun {
  readonly startedBy: string;

  // the version hash a definition's task runs, which its endpoint's tool list comes from
  readonly definitionHash: string | null;

  // set for a definition's task whose version holds the self-note grant, and for no other run: a
  // started task's options never grant it
  readonly hasSelfNoteGrant: boolean;

  // the self-note tools that the grant adds because the version's list leaves them out: they write
  // self-notes and nothing else
  readonly selfNoteOnlyTools: readonly string[];

  // the skills the version lists, which the run's skill tools and catalog follow; none for a run
  // with no definition
  readonly skills: readonly string[];

  // set for a definition's task under a fresh context: the session reads the log after it
  readonly sinceSequence: number | null;
  readonly options: TaskRunOptions;
  readonly profile: ResolvedProfile;
  readonly harness: Harness;
  readonly command: GuestCommand;
  readonly model: ToolRunModel;

  // the call that the task holds, or null for a task that is no call's
  readonly call: CallTaskOptions | null;
}

export async function readStartedRun(runner: RunReader, taskID: string): Promise<StartedRun> {
  const setup = await readTaskSetup(runner.options.context, taskID);

  if (setup?.kind === 'definition') {
    return readDefinitionRun(runner, taskID);
  }

  invariant(setup?.kind === 'started', `the sandbox runner runs started tasks only, not ${taskID}`);

  if (setup.runner === callRunnerKey) {
    return readCallRun(runner, taskID, setup);
  }

  return buildStartedRun(runner, setup);
}

async function readDefinitionRun(runner: RunReader, taskID: string): Promise<StartedRun> {
  const context = runner.options.context;

  const found = await readDefinitionRunContext(context, taskID);

  invariant(found !== null, `the definition's task ${taskID} holds no version`);

  const version = await context.readDefinitionVersion(context.log.writer.db, found.definitionHash);

  invariant(version !== null, `the version ${found.definitionHash} of ${taskID} is not stored`);

  const choice =
    version.model === null
      ? undefined
      : runner.options.models.selectable.find((entry) => entry.name === version.model);

  invariant(
    version.model === null || choice !== undefined,
    `the model ${version.model ?? ''} is not defined`,
  );

  return buildRunParts(runner, {
    startedBy: found.report.target ?? taskID,
    options: {
      model: version.model,
      profile: choice?.profile ?? null,
      persona: version.persona,
      memory: version.memory,
      log: version.log,
      tools: pickRunTools(version, runner.options),
      report: found.report.mode,
      limits: runner.options.models.limits.taskRun.default,
    },
    definitionHash: found.definitionHash,
    hasSelfNoteGrant: version.memory === 'self_notes',
    selfNoteOnlyTools: pickSelfNoteOnlyTools(version),
    skills: version.skills,
    sinceSequence: pickSinceSequence(version.context, found),
  });
}

type RunParts = Pick<
  StartedRun,
  | 'startedBy'
  | 'options'
  | 'definitionHash'
  | 'hasSelfNoteGrant'
  | 'selfNoteOnlyTools'
  | 'skills'
  | 'sinceSequence'
> &
  Partial<Pick<StartedRun, 'call'>>;

function buildRunParts(runner: RunReader, parts: RunParts): StartedRun {
  const profile =
    parts.options.profile === null
      ? runner.session.profile
      : runner.profiles[parts.options.profile];

  invariant(profile, `the task's profile ${parts.options.profile ?? ''} is not defined`);

  const harness = bindHarness(profile.profile);

  return {
    ...parts,
    profile,
    harness,
    command: buildGuestCommand(runner.options.sandboxes, harness.guest),
    model: { model: profile.profile.model, profile: profile.profile.id },
    call: parts.call ?? null,
  };
}

// A version with memory read or the self-note grant gets the memory read tools, and the grant adds
// the 4 self-note write tools. Each tool its list names stays, as it does at memory read.
function pickRunTools(
  version: Pick<DefinitionVersion, 'memory' | 'tools' | 'skills'>,
  options: Pick<SandboxRunnerOptions, 'memoryReadTools'>,
): readonly string[] {
  // The code tool mounts the listed skills under /skills/<name>/, so a run with skills holds it too.
  const skillTools = version.skills.length === 0 ? [] : [...jobSkillToolNames, codeRunToolName];

  return match(version.memory)
    .with('none', () => [...new Set([...version.tools, ...skillTools])])
    .with('read', () => [...new Set([...version.tools, ...options.memoryReadTools, ...skillTools])])
    .with('self_notes', () => [
      ...new Set([
        ...version.tools,
        ...options.memoryReadTools,
        ...selfNoteToolNames,
        ...skillTools,
      ]),
    ])
    .exhaustive();
}

// A tool the version's list names writes as it does at memory read, so only the tools the grant
// adds are held to self-notes.
function pickSelfNoteOnlyTools(version: Pick<DefinitionVersion, 'memory' | 'tools'>): string[] {
  return version.memory === 'self_notes'
    ? selfNoteToolNames.filter((name) => !version.tools.includes(name))
    : [];
}

// A fresh context opens a session at each piece of work, and a continuing one keeps the last.
function pickSinceSequence(
  context: 'fresh' | 'continuing',
  found: DefinitionRunContext,
): number | null {
  return context === 'fresh' && found.pieceStart !== null ? found.pieceStart - 1 : null;
}

// A call's turns use the call role, or the conversation's profile when the role is unset. The call
// takes the conversation's persona, memory read and tool list, less the tools that start work,
// ring or end a task run.
async function readCallRun(
  runner: RunReader,
  taskID: string,
  setup: StartedTaskSetup,
): Promise<StartedRun> {
  const call = await readCallTask(runner.options.context, taskID);

  invariant(call !== null, `the call's task ${taskID} holds no call`);

  const roles = runner.options.models.roles;
  const calls = runner.options.calls;

  invariant(calls !== undefined, `the call's task ${taskID} runs where calls are off`);

  return buildRunParts(runner, {
    startedBy: setup.startedBy,
    options: {
      model: null,
      profile: roles.call ?? roles.conversation,
      persona: 'default',
      memory: 'read',
      log: 'own',
      tools: pickCallTools(calls.conversationToolNames, calls.addedToolNames),
      report: 'none',
      limits: runner.options.models.limits.taskRun.default,
    },
    definitionHash: null,
    hasSelfNoteGrant: false,
    selfNoteOnlyTools: [],
    skills: [],
    sinceSequence: null,
    call,
  });
}

function buildStartedRun(runner: RunReader, setup: StartedTaskSetup): StartedRun {
  // A task started by moving a message to it holds no options: no persona, no memory, default tools.
  const options: TaskRunOptions = setup.options ?? {
    model: null,
    profile: null,
    persona: 'none',
    memory: 'none',
    log: 'own',
    tools: startedTaskDefaultTools,
    report: 'wake',
    limits: runner.options.models.limits.taskRun.default,
  };

  return buildRunParts(runner, {
    startedBy: setup.startedBy,
    options,
    definitionHash: null,
    hasSelfNoteGrant: false,
    selfNoteOnlyTools: [],
    skills: [],
    sinceSequence: null,
  });
}
