import { RE2JS } from 're2js';

const compiled = new Map<string, RE2JS>();

// Compiles a pattern on re2js once. A pattern runs in linear time in the length of its input.
export function compilePattern(pattern: string): RE2JS {
  const known = compiled.get(pattern);

  if (known !== undefined) {
    return known;
  }

  const created = RE2JS.compile(pattern);

  compiled.set(pattern, created);

  return created;
}
