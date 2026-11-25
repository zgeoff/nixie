import type { Rule, RuleCheck, RuleContext, RuleSource } from '@heynixie/policy';

export interface ProposedRuleCall {
  readonly tool: string;
  readonly context: RuleContext;
  readonly definitionID: string | null;
  readonly sources: readonly RuleSource[];

  // the names of the tool's free-text arguments
  readonly content: readonly string[];
  readonly input: Readonly<Record<string, unknown>>;
  readonly destinations: readonly string[];
}

// The narrowest allow rule that every one of the calls matches, or null when none can be exact: a
// destination pattern reads `*` as a wildcard and has no escape, so a destination that holds `*`
// has no exact rule.
export function buildProposedRule(
  calls: readonly [ProposedRuleCall, ...ProposedRuleCall[]],
): Omit<Rule, 'id'> | null {
  const [first] = calls;

  if (calls.some((call) => call.destinations.some((destination) => destination.includes('*')))) {
    return null;
  }

  const definitions = new Set(calls.map((call) => call.definitionID));

  const definitionID = definitions.size === 1 ? first.definitionID : null;
  const isEverySourced = calls.every((call) => call.sources.length > 0);
  const sources = isEverySourced ? [...new Set(calls.flatMap((call) => call.sources))] : [];
  const checks = collectChecks(calls);

  return {
    outcome: 'allow',
    tools: [first.tool],
    contexts: [first.context],
    ...(definitionID === null ? {} : { definitions: [definitionID] }),
    ...(checks.length === 0 ? {} : { checks }),
    ...(first.destinations.length === 0 ? {} : { destinations: [...first.destinations] }),
    ...(sources.length === 0 ? {} : { sources }),
  };
}

type Scalar = string | number | boolean;

function collectChecks(calls: readonly ProposedRuleCall[]): RuleCheck[] {
  const held = calls.map((call) => collectScalars(call));
  const [firstHeld = new Map<string, Scalar>()] = held;

  return [...firstHeld.entries()]
    .filter(([path, value]) => held.every((other) => other.get(path) === value))
    .map(([path, value]): RuleCheck => ({ arg: path, op: 'eq', value }));
}

// Each scalar argument by its dot path. A list, and every argument of free text, gives none.
function collectScalars(call: ProposedRuleCall): ReadonlyMap<string, Scalar> {
  const found = new Map<string, Scalar>();

  for (const [name, value] of Object.entries(call.input)) {
    addScalars(found, call.content, name, value);
  }

  return found;
}

const argumentPath = /^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*$/u;

// An argument of free text is left out at every depth, by the path the declaration names it with:
// `details.body` for a nested one, and `labels.*` for any key of an object.
function addScalars(
  found: Map<string, Scalar>,
  content: readonly string[],
  path: string,
  value: unknown,
): void {
  if (!argumentPath.test(path) || isContentPath(content, path)) {
    return;
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    found.set(path, value);
  } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    for (const [name, inner] of Object.entries(value)) {
      addScalars(found, content, `${path}.${name}`, inner);
    }
  }
}

function isContentPath(content: readonly string[], path: string): boolean {
  const segments = path.split('.');

  return content.some((entry) => {
    const named = entry.split('.');

    return (
      named.length === segments.length &&
      named.every((segment, index) => segment === '*' || segment === segments[index])
    );
  });
}
