import type { ConditionError } from '@heynixie/policy';

// It never holds the library's message, which can quote argument text. An allow rule that a
// missing argument stopped names the argument, so the model can call again with it. A content
// argument is never named, because the condition can't read it.
export function buildConditionNotice(errors: readonly ConditionError[]): string | null {
  if (errors.length === 0) {
    return null;
  }

  const lines = errors.map((error) =>
    error.outcome === 'allow' && error.code === 'no_such_key' && error.missing !== undefined
      ? `The rule \`${error.ruleID}\` would allow this call, but its condition failed with the error no_such_key: the call left out the argument ${renderCodeSpan(error.missing)}. Call again with it.`
      : `The condition of the rule \`${error.ruleID}\` failed with the error ${error.code}.`,
  );

  return lines.join(' ');
}

// A span fenced by more backticks than the text holds in a row, so a key with a backtick stays whole
function renderCodeSpan(text: string): string {
  const longestRun = Math.max(0, ...(text.match(/`+/gu) ?? []).map((run) => run.length));
  const fence = '`'.repeat(longestRun + 1);

  return longestRun === 0 ? `${fence}${text}${fence}` : `${fence} ${text} ${fence}`;
}
