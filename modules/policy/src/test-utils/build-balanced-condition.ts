// A condition that joins the terms with one operator as a balanced tree, so it stays shallow where
// a flat chain of the same terms would run deep. It holds 2n - 1 nodes of the parser for n terms of
// one node each.
export function buildBalancedCondition(terms: readonly string[], operator: '&&' | '||'): string {
  const [first, ...rest] = terms;

  if (first === undefined) {
    return 'true';
  }

  if (rest.length === 0) {
    return first;
  }

  const half = Math.floor(terms.length / 2);
  const left = buildBalancedCondition(terms.slice(0, half), operator);
  const right = buildBalancedCondition(terms.slice(half), operator);

  return `(${left} ${operator} ${right})`;
}
