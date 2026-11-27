import type { SessionBrief } from '@heynixie/coding';
import type { ATCFleet } from '../call/connect-atc';

export type SpawnArguments = Parameters<ATCFleet['session']['spawn']>[0];

// The spawn that atc-gateway takes, and no other field. The workspace is a git checkout of the
// repo that the start names, which the user approved with the start, so atc trusts the clone.
export function buildSpawnArguments(brief: SessionBrief, idempotencyKey: string): SpawnArguments {
  return {
    name: brief.name,
    prompt: brief.prompt,
    ...(brief.agent === undefined ? {} : { agent: brief.agent }),
    ...(brief.model === undefined ? {} : { model: brief.model }),
    daemon: brief.target.daemon,
    target: brief.target.target,
    workspace: { kind: 'git', url: brief.repo.url, ref: brief.repo.ref },
    trustClonedWorkspace: true,
    idempotencyKey,
  };
}
