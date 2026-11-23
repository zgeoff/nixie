import type { Harness, ResolvedProfile } from '@heynixie/models';
import { bindHarness } from '@heynixie/models';
import type { GuestCommand } from '@heynixie/sandbox';
import type {
  DefinitionRunContext,
  DefinitionVersion,
  StartedTaskSetup,
  TaskRunOptions,
} from '@heynixie/tasks';
import {
  readDefinitionRunContext,
  readTaskSetup,
  selfNoteToolNames,
  startedTaskDefaultTools,
} from '@heynixie/tasks';
import type { ToolRunModel } from '@heynixie/tools';
import { findHeldToolName } from '@heynixie/tools';
import invariant from 'tiny-invariant';
import { match } from 'ts-pattern';
import { buildGuestCommand } from './build-guest-command';
import type { SystemTaskSession } from './make-system-task-runner';
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

  // set for a definition's task under a fresh context: the session reads the log after it
  readonly sinceSequence: number | null;
  readonly options: TaskRunOptions;
  readonly profile: ResolvedProfile;
  readonly harness: Harness;
  readonly command: GuestCommand;
  readonly model: ToolRunModel;
}

export async function readStartedRun(runner: RunReader, taskID: string): Promise<StartedRun> {
  const setup = await readTaskSetup(runner.options.context, taskID);

  if (setup?.kind === 'definition') {
    return readDefinitionRun(runner, taskID);
  }

  invariant(setup?.kind === 'started', `the sandbox runner runs started tasks only, not ${taskID}`);

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
    sinceSequence: pickSinceSequence(version.context, found),
  });
}

type RunParts = Pick<
  StartedRun,
  'startedBy' | 'options' | 'definitionHash' | 'hasSelfNoteGrant' | 'sinceSequence'
>;

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
  };
}

// A version with the self-note grant gets the memory read tools and the 4 self-note write tools,
// and no other memory write tool, whatever its list names.
function pickRunTools(
  version: Pick<DefinitionVersion, 'memory' | 'tools'>,
  options: Pick<SandboxRunnerOptions, 'memoryReadTools' | 'memoryWriteTools'>,
): readonly string[] {
  return match(version.memory)
    .with('none', () => version.tools)
    .with('read', () => [...new Set([...version.tools, ...options.memoryReadTools])])
    .with('self_notes', () => {
      const listed = version.tools.filter(
        (tool) =>
          findHeldToolName(tool, options.memoryWriteTools) === null ||
          findHeldToolName(tool, selfNoteToolNames) !== null,
      );

      return [...new Set([...listed, ...options.memoryReadTools, ...selfNoteToolNames])];
    })
    .exhaustive();
}

// A fresh context opens a session at each piece of work, and a continuing one keeps the last.
function pickSinceSequence(
  context: 'fresh' | 'continuing',
  found: DefinitionRunContext,
): number | null {
  return context === 'fresh' && found.pieceStart !== null ? found.pieceStart - 1 : null;
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
    sinceSequence: null,
  });
}
