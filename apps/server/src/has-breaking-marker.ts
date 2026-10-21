export function hasBreakingMarker(header: string): boolean {
  return /^[a-z]+(?:\([^()]*\))?!: \S/u.test(header);
}
