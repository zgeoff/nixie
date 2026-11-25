import type { ServerFacts } from '../types';
import { parseCIDR } from './parse-cidr';

export type FactsChange = 'same' | 'widened' | 'narrowed';

// Sorts what a config entry asks for against the facts in use: a new URL or client ID, more scopes,
// a wider range or `trusted` on widen; fewer scopes, a narrower range or `trusted` off narrow. An
// entry that does both widens, because the proposal then carries every fact of the entry.
export function classifyServerFacts(inUse: ServerFacts, asked: ServerFacts): FactsChange {
  const inUseScopes = toScopeSet(inUse.scope);
  const askedScopes = toScopeSet(asked.scope);
  const rangeChange = classifyRange(inUse.privateRange, asked.privateRange);

  const isWidened =
    inUse.url !== asked.url ||
    inUse.clientID !== asked.clientID ||
    [...askedScopes].some((scope) => !inUseScopes.has(scope)) ||
    (!inUse.trusted && asked.trusted) ||
    rangeChange === 'widened';

  if (isWidened) {
    return 'widened';
  }

  const isNarrowed =
    [...inUseScopes].some((scope) => !askedScopes.has(scope)) ||
    (inUse.trusted && !asked.trusted) ||
    rangeChange === 'narrowed';

  return isNarrowed ? 'narrowed' : 'same';
}

function toScopeSet(scope: string): ReadonlySet<string> {
  return new Set(scope.split(/\s+/u).filter((part) => part !== ''));
}

function classifyRange(inUse: string | null, asked: string | null): FactsChange {
  if (inUse === asked) {
    return 'same';
  }

  if (asked === null) {
    return 'narrowed';
  }

  if (inUse === null) {
    return 'widened';
  }

  const before = parseCIDR(inUse);
  const after = parseCIDR(asked);

  // a range that does not parse counts as wider, so a proposal always covers it
  if (before === null || after === null || before.family !== after.family) {
    return 'widened';
  }

  if (before.first === after.first && before.last === after.last) {
    return 'same';
  }

  return after.first >= before.first && after.last <= before.last ? 'narrowed' : 'widened';
}
