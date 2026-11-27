import type { ConditionError } from '@heynixie/policy';

// It never holds the library's message, which can quote argument text. An allow rule that a
// missing argument stopped names the argument, so the model can call again with it.
export function buildConditionNotice(errors: readonly ConditionError[]): string | null {
  if (errors.length === 0) {
    return null;
  }

  const lines = errors.map((error) =>
    error.outcome === 'allow' && error.code === 'no_such_key' && error.missing !== undefined
      ? `The rule \`${error.ruleID}\` would allow this call, but its condition needs the argument \`${error.missing}\`, which the call left out. Call again with it.`
      : `The condition of the rule \`${error.ruleID}\` failed with the error ${error.code}.`,
  );

  return lines.join(' ');
}
