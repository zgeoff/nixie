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

// The narrowest allow rule that every one of the calls matches. The calls share one gap group, so
// they share the tool, the context and the set of destinations.
export function buildProposedRule(
  calls: readonly [ProposedRuleCall, ...ProposedRuleCall[]],
): Omit<Rule, 'id'> {
  const [first] = calls;

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
    if (!call.content.includes(name)) {
      addScalars(found, name, value);
    }
  }

  return found;
}

const argumentPath = /^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*$/u;

function addScalars(found: Map<string, Scalar>, path: string, value: unknown): void {
  if (!argumentPath.test(path)) {
    return;
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    found.set(path, value);
  } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    for (const [name, inner] of Object.entries(value)) {
      addScalars(found, `${path}.${name}`, inner);
    }
  }
}
