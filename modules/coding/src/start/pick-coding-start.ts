import type { CodingSettings, SessionBrief, TargetRef, WakeEvent } from '../types';
import type { CodingStartInput } from './build-coding-start-schema';

export type CodingStartChoice =
  | { readonly kind: 'start'; readonly brief: SessionBrief; readonly wake: readonly WakeEvent[] }
  | { readonly kind: 'join'; readonly shortID: string; readonly wake: readonly WakeEvent[] }
  | { readonly kind: 'refused'; readonly sentence: string };

// What a coding start asks for: a new session on a repository, or a join of a running one, with
// the target and agent from the settings when the input names none.
export function pickCodingStart(
  input: CodingStartInput,
  settings: CodingSettings,
): CodingStartChoice {
  if ((input.repo === undefined) === (input.session === undefined)) {
    return refuse('Give exactly one of repo, to start a session, and session, to join one.');
  }

  if (input.session !== undefined) {
    const startOnly = (['target', 'agent', 'model'] as const).find(
      (key) => input[key] !== undefined,
    );

    return startOnly === undefined
      ? { kind: 'join', shortID: input.session, wake: input.wake ?? settings.wake.joined }
      : refuse(`A join takes no ${startOnly}: it joins the session as it runs.`);
  }

  const repo = input.repo;

  if (repo === undefined || !isRepoURL(repo.url)) {
    return refuse('The repo url must be an https:// or ssh URL of a git repository.');
  }

  const target = pickTarget(input.target, settings);

  if (target === null) {
    const names = settings.targets.map((entry) => `${entry.daemon}/${entry.target}`).join(', ');

    return refuse(`The target must be one of ${names}.`);
  }

  const agent = input.agent ?? settings.agent;

  return {
    kind: 'start',
    brief: {
      name: input.name,
      prompt: input.brief,
      repo: { url: repo.url, ref: repo.ref },
      target,
      ...(agent === undefined ? {} : { agent }),
      ...(input.model === undefined ? {} : { model: input.model }),
    },
    wake: input.wake ?? settings.wake.started,
  };
}

function refuse(sentence: string): CodingStartChoice {
  return { kind: 'refused', sentence };
}

const repoURLPattern = /^(?:https:\/\/|ssh:\/\/|[\w.-]+@[\w.-]+:)\S+$/u;

function isRepoURL(url: string): boolean {
  return !url.startsWith('-') && repoURLPattern.test(url);
}

function pickTarget(named: string | undefined, settings: CodingSettings): TargetRef | null {
  if (named === undefined) {
    return settings.defaultTarget;
  }

  return settings.targets.find((target) => `${target.daemon}/${target.target}` === named) ?? null;
}
