export function formatMemoryChecks(checks: Readonly<Record<string, unknown>>): string {
  return Object.entries(checks)
    .flatMap(([name, verdict]) => {
      const value = findVerdict(verdict);

      return value === null ? [] : [`${name} ${value}`];
    })
    .join(' · ');
}

function findVerdict(verdict: unknown): string | null {
  if (verdict === 'pass') {
    return 'passed';
  }

  if (verdict === 'fail') {
    return 'failed';
  }

  if (typeof verdict === 'string') {
    return verdict;
  }

  if (typeof verdict === 'object' && verdict !== null && 'verdict' in verdict) {
    return typeof verdict.verdict === 'string' ? verdict.verdict : null;
  }

  return null;
}
