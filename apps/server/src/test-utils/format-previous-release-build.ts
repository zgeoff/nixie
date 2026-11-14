import type { PreviousReleaseBuild } from './read-previous-release-build';

export function formatPreviousReleaseBuild(build: PreviousReleaseBuild): string {
  if (build.times === null) {
    return `the previous release ${build.tag} was cached, so no phase ran`;
  }

  const times = build.times;
  const totalMs = times.worktreeMs + times.installMs + times.buildMs;

  return `the previous release ${build.tag} built in ${toSeconds(totalMs)}: worktree ${toSeconds(times.worktreeMs)}, install ${toSeconds(times.installMs)}, build ${toSeconds(times.buildMs)}`;
}

function toSeconds(durationMs: number): string {
  return `${(durationMs / 1000).toFixed(1)} s`;
}
