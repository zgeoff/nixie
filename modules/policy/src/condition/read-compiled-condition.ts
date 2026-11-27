import type { ParseResult } from '@marcbachmann/cel-js';
import { buildConditionView } from './build-condition-view';
import { maxConditionChars, maxConditionDepth, maxConditionNodes } from './constants';
import { getConditionDepth } from './get-condition-depth';
import { makeConditionEnvironment } from './make-condition-environment';
import { normalizeConditionLiterals } from './normalize-condition-literals';
import { pickRefusedConstruct } from './pick-refused-construct';
import { rewriteTimeMethods } from './rewrite-time-methods';
import type { ConditionCheck, ConditionSource } from './types';
import { wrapMacroReceivers } from './wrap-macro-receivers';

export interface CompiledCondition {
  readonly check: ConditionCheck;

  // null when the check refused the condition
  readonly run: ParseResult | null;
}

const cacheLimit = 1000;

const cache = new Map<string, CompiledCondition>();

// nixie checks each condition text once, and reuses the result. The key holds the text with
// whether the rule has a note, because the note is the first step of the check.
export function readCompiledCondition(source: ConditionSource): CompiledCondition {
  const key = `${source.note === undefined ? '-' : 'n'}${source.cel}`;
  const cached = cache.get(key);

  if (cached !== undefined) {
    return cached;
  }

  const compiled = compile(source.cel, source.note !== undefined);

  if (cache.size >= cacheLimit) {
    cache.clear();
  }

  cache.set(key, compiled);

  return compiled;
}

const environment = makeConditionEnvironment();

// Each macro adds one wrapper node, and the node limit bounds the macros, so the node limit again is
// room enough. The wrapper adds at most one level, and the room in depth covers it.
const runEnvironment = makeConditionEnvironment(maxConditionNodes);

// The steps run in this order and stop at the first fault.
function compile(text: string, hasNote: boolean): CompiledCondition {
  if (!hasNote) {
    return refuse('condition_note_missing', 'a rule with a condition needs a note');
  }

  if (text.length > maxConditionChars) {
    return refuse('condition_too_large', `over ${maxConditionChars} characters`);
  }

  let parsed: ParseResult;

  try {
    parsed = environment.parse(text);
  } catch (error) {
    const fault = isLimitError(error) ? 'condition_too_large' : 'condition_syntax';

    return refuse(fault, describeError(error));
  }

  normalizeConditionLiterals(parsed.ast);

  if (getConditionDepth(parsed.ast) > maxConditionDepth) {
    return refuse('condition_too_large', `deeper than ${maxConditionDepth} levels`);
  }

  const construct = pickRefusedConstruct(parsed.ast);

  if (construct !== null) {
    return refuse('condition_not_allowed', construct);
  }

  const view = buildConditionView(parsed.ast);

  rewriteTimeMethods(parsed.ast);

  const refused = pickTypeRefusal(parsed.check());

  if (refused !== null) {
    return refused;
  }

  const runnable = runEnvironment.parse(wrapMacroReceivers(text, parsed.ast));

  normalizeConditionLiterals(runnable.ast);
  rewriteTimeMethods(runnable.ast);

  const wrapped = pickTypeRefusal(runnable.check());

  return wrapped ?? { check: { ok: true, view }, run: runnable };
}

function refuse(
  fault: Extract<ConditionCheck, { ok: false }>['fault'],
  detail: string,
): CompiledCondition {
  return { check: { ok: false, fault, detail }, run: null };
}

function isLimitError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'limit_exceeded'
  );
}

function describeError(error: unknown): string {
  return typeof error === 'object' &&
    error !== null &&
    'summary' in error &&
    typeof error.summary === 'string'
    ? error.summary
    : 'the condition does not parse';
}

// The type check runs on the text as written, which holds each macro's receiver at its own type, and
// again on the text that runs.
function pickTypeRefusal(checked: ReturnType<ParseResult['check']>): CompiledCondition | null {
  if (!checked.valid) {
    return refuse('condition_type', checked.error?.summary ?? 'the type check failed');
  }

  if (checked.type !== 'bool') {
    return refuse('condition_type', `the condition gives ${checked.type}, and it must give bool`);
  }

  return null;
}
