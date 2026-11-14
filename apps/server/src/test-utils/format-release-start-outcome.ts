import { match } from 'ts-pattern';
import type { ReleaseStartOutcome } from './read-release-start-outcome';

export function formatReleaseStartOutcome(tag: string, result: ReleaseStartOutcome): string {
  return match(result)
    .with(
      { outcome: 'started' },
      (started) =>
        `the previous release ${tag} started: /health/ready answered ${String(started.readyStatus)} ${started.readyBody}`,
    )
    .with(
      { outcome: 'refused' },
      (refused) =>
        `the previous release ${tag} refused: exit ${String(refused.exit.code)}, signal ${String(refused.exit.signal)}, output ${JSON.stringify(refused.output)}`,
    )
    .exhaustive();
}
