// Whether a Conventional Commits header marks a breaking change with `!` before its colon, as in
// `feat(config)!: rename the port`. A squash merge makes the pull request title the commit header,
// and release-please lists a commit so marked under the changelog's breaking changes.
export function hasBreakingMarker(header: string): boolean {
  return /^[a-z]+(?:\([^()]*\))?!: \S/u.test(header);
}
