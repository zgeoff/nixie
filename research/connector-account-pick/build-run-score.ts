// Scores one account-pick run from the calls it made. Every call counts: a call that passes another
// allowed account is a wrong-account call, and a call whose value is not allowed is an invalid
// call. The first call's outcome stays a number of its own.

export interface Connection {
  account: string | null;
  id: string;
  label: string;
}

export interface ScoredCase {
  expect: string | null;
  kind: string;
}

export interface Call {
  args: { connection?: unknown };
  error: boolean;
}

export interface RunScore {
  final: 'right' | 'wrong' | 'none';
  first: 'right' | 'wrong-account' | 'invalid' | 'none';
  invalidCalls: number;
  kind: string;
  pass: boolean;
  wrongAccountCalls: number;
}

type CallOutcome = 'right' | 'wrong-account' | 'invalid';

export function buildRunScore(
  item: ScoredCase,
  connections: Connection[],
  arm: string,
  calls: Call[],
): RunScore {
  const toValue = (connection: Connection): string =>
    arm === 'label' ? connection.label : connection.id;
  const allowed = connections.map(toValue);
  const target = connections.find((connection) => connection.label === item.expect);
  const expected = target ? toValue(target) : null;
  const outcomes = calls.map((call) => pickCallOutcome(call, allowed, expected));
  const first = outcomes[0] ?? 'none';
  const wrongAccountCalls = outcomes.filter((outcome) => outcome === 'wrong-account').length;
  const invalidCalls = outcomes.filter((outcome) => outcome === 'invalid').length;
  const lastGood = calls.findLast((call) => !call.error);
  let final: RunScore['final'] = 'none';
  if (lastGood) {
    const value = lastGood.args.connection;
    final = typeof value === 'string' && value === expected ? 'right' : 'wrong';
  }
  return {
    final,
    first,
    invalidCalls,
    kind: item.kind,
    pass: isPass(item.kind, first, calls.length, wrongAccountCalls),
    wrongAccountCalls,
  };
}

// The schema takes a string, so any other value is invalid, even one that would print as an allowed
// value, such as an array that holds one.
function pickCallOutcome(call: Call, allowed: string[], expected: string | null): CallOutcome {
  const value = call.args.connection;
  if (typeof value !== 'string') {
    return 'invalid';
  }
  if (value === expected) {
    return 'right';
  }
  return allowed.includes(value) ? 'wrong-account' : 'invalid';
}

// An ask case passes with no call at all. Any other case fails on a wrong-account call anywhere in
// the run. An implied case also passes when the model asks, and a named case needs a right first
// call.
function isPass(
  kind: string,
  first: RunScore['first'],
  callCount: number,
  wrongAccountCalls: number,
): boolean {
  if (kind === 'ask') {
    return callCount === 0;
  }
  if (wrongAccountCalls > 0) {
    return false;
  }
  if (kind === 'implied') {
    return first === 'right' || first === 'none';
  }
  return first === 'right';
}
