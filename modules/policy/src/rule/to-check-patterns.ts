// The patterns of a `matches` or `excludes` check, which holds one pattern or a list.
export function toCheckPatterns(value: string | readonly string[]): readonly string[] {
  return typeof value === 'string' ? [value] : value;
}
