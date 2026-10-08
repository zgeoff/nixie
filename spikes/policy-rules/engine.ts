/* oxlint-disable max-lines, max-statements, max-params, no-nested-ternary, one-var, sort-vars -- a throwaway spike keeps each question in one readable pass */
// A throwaway prototype of nixie's rule engine: rule format, the decision
// pipeline, canonical hashing and the widening check. Not product code.
import { createHash } from 'node:crypto';

export type Outcome = 'allow' | 'ask' | 'deny';

export type Effect =
  | 'read'
  | 'fetch'
  | 'note'
  | 'write'
  | 'delete'
  | 'send'
  | 'spend'
  | 'schedule'
  | 'run_code'
  | 'device'
  | 'policy_widen'
  | 'policy_narrow'
  | 'budget_raise'
  | 'budget_lower';

export const ALWAYS_ASK: ReadonlySet<Effect> = new Set(['spend', 'policy_widen', 'budget_raise']);

export type ContextKind = 'conversation' | 'task' | 'job';

export interface ToolDecl {
  name: string;
  effects: Effect[];
  destinationArgs?: string[];
  amountArg?: string;
}

export type Check =
  | { arg: string; op: 'eq'; value: string | number | boolean }
  | { arg: string; op: 'in'; values: (string | number)[] }
  | { arg: string; op: 'matches'; pattern: string };

export interface Lift {
  perAction: number;
  budget: string;
}

export interface Rule {
  id: string;
  outcome: Outcome;
  tools?: string[];
  effects?: Effect[];
  contexts?: ContextKind[];
  jobs?: string[];
  checks?: Check[];
  destinations?: string[];
  lift?: Lift;
  expiresAt?: number;
  cel?: string;
}

export interface Budget {
  id: string;
  limit: number;
  period: 'day' | 'month';
}

export interface Policy {
  tools: ToolDecl[];
  rules: Rule[];
  budgets: Budget[];
  knownContacts: string[];
}

export interface OwnerMessage {
  typed: string;
  requested: boolean;
}

export interface Call {
  tool: string;
  args: Record<string, unknown>;
  context: ContextKind;
  job?: string;
  toolList?: string[];
  replyTarget?: string;
  owner?: OwnerMessage;
  contactsBook?: Record<string, string>;
  time: number;
}

export type Cause =
  | 'direct_request'
  | 'repeat'
  | 'outside_steering'
  | 'always_ask'
  | 'no_rule'
  | 'ask_rule';

export interface Decision {
  outcome: Outcome;
  stage: string;
  rule?: string;
  cause?: Cause;
  detail?: string;
}

export interface Ledger {
  spent: Map<string, number>;
}

function readArg(args: Record<string, unknown>, path: string): unknown {
  let value: unknown = args;
  for (const part of path.split('.')) {
    if (typeof value !== 'object' || value === null) {
      return undefined;
    }
    value = (value as Record<string, unknown>)[part];
  }
  return toNfc(value);
}

// strings compare in NFC, the same form the snapshot hash serialises
function toNfc(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.normalize('NFC');
  }
  return Array.isArray(value) ? value.map((item) => toNfc(item)) : value;
}

// glob with `*` only, anchored at both ends
export function isGlobMatch(rawPattern: string, rawText: string): boolean {
  const pattern = rawPattern.normalize('NFC'),
    text = rawText.normalize('NFC'),
    parts = pattern.split('*');
  if (parts.length === 1) {
    return pattern === text;
  }
  const first = parts[0] ?? '',
    last = parts.at(-1) ?? '';
  if (!text.startsWith(first) || !text.endsWith(last) || text.length < first.length + last.length) {
    return false;
  }
  let at = first.length;
  for (const middle of parts.slice(1, -1)) {
    const found = text.indexOf(middle, at);
    if (found === -1 || found + middle.length > text.length - last.length) {
      return false;
    }
    at = found + middle.length;
  }
  return true;
}

function toList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [value];
}

// on a list argument, an allow rule needs every element to pass; a deny or ask
// rule catches the call when any element passes
function isCheckMet(check: Check, args: Record<string, unknown>, all: boolean): boolean {
  const values = toList(readArg(args, check.arg));
  if (values.length === 0 || values[0] === undefined) {
    return false;
  }
  const isPassing = (value: unknown): boolean => {
    switch (check.op) {
      case 'eq': {
        return value === toNfc(check.value);
      }
      case 'in': {
        return (toNfc(check.values) as unknown[]).includes(value);
      }
      case 'matches': {
        return typeof value === 'string' && isGlobMatch(check.pattern, value);
      }
      default: {
        return false;
      }
    }
  };
  return all ? values.every((value) => isPassing(value)) : values.some((value) => isPassing(value));
}

export function findTool(policy: Policy, name: string): ToolDecl | undefined {
  return policy.tools.find((tool) => tool.name === name);
}

export function getEffects(policy: Policy, call: Call): Effect[] {
  const tool = findTool(policy, call.tool);
  if (!tool) {
    return [];
  }
  const effects = new Set(tool.effects);

  // a job definition carries the effects of every tool on its list
  if (call.tool === 'job.create') {
    for (const name of toList(call.args.tools) as string[]) {
      for (const effect of findTool(policy, name)?.effects ?? []) {
        effects.add(effect);
      }
    }
  }
  return [...effects];
}

export function getDestinations(policy: Policy, call: Call): string[] {
  const tool = findTool(policy, call.tool),
    out: string[] = [];
  for (const arg of tool?.destinationArgs ?? []) {
    for (const value of toList(readArg(call.args, arg))) {
      if (typeof value === 'string') {
        out.push(value);
      }
    }
  }
  return out;
}

// whether a rule's match conditions hold, ignoring outcome-specific effect logic
export function isRuleMatch(policy: Policy, rule: Rule, call: Call): boolean {
  if (rule.expiresAt !== undefined && call.time >= rule.expiresAt) {
    return false;
  }
  if (rule.cel !== undefined) {
    return false;
  }
  if (rule.tools && !rule.tools.some((pattern) => isGlobMatch(pattern, call.tool))) {
    return false;
  }
  if (rule.contexts && !rule.contexts.includes(call.context)) {
    return false;
  }
  if (rule.jobs && (call.job === undefined || !rule.jobs.includes(call.job))) {
    return false;
  }

  // an allow rule covers a call only when it covers every effect; a deny or
  // ask rule catches a call with any listed effect
  if (rule.effects) {
    const effects = getEffects(policy, call),
      listed = new Set(rule.effects),
      hit =
        rule.outcome === 'allow'
          ? effects.length > 0 && effects.every((effect) => listed.has(effect))
          : effects.some((effect) => listed.has(effect));
    if (!hit) {
      return false;
    }
  }
  if (
    rule.checks &&
    !rule.checks.every((check) => isCheckMet(check, call.args, rule.outcome === 'allow'))
  ) {
    return false;
  }
  if (rule.destinations) {
    const destinations = getDestinations(policy, call),
      isFit = (destination: string): boolean =>
        (rule.destinations ?? []).some((pattern) => isGlobMatch(pattern, destination)),
      covered =
        rule.outcome === 'allow'
          ? destinations.every((destination) => isFit(destination))
          : destinations.some((destination) => isFit(destination));
    if (!covered) {
      return false;
    }
  }
  return true;
}

function hasBudgetRoom(policy: Policy, ledger: Ledger, lift: Lift, amount: number): boolean {
  const budget = policy.budgets.find((item) => item.id === lift.budget);
  if (!budget) {
    return false;
  }
  const spent = ledger.spent.get(budget.id) ?? 0;
  return amount <= lift.perAction && spent + amount <= budget.limit;
}

function resolveContact(call: Call, destination: string): string | undefined {
  return Object.entries(call.contactsBook ?? {}).find(
    ([, address]) => address === destination,
  )?.[0];
}

// the code half of the consent check: the destination, or a saved contact name
// that resolves to it, appears word for word in text the owner typed
export function isNamedVerbatim(call: Call, destination: string): boolean {
  const typed = call.owner?.typed;
  if (typed === undefined) {
    return false;
  }
  if (typed.includes(destination)) {
    return true;
  }
  const name = resolveContact(call, destination);
  return name !== undefined && hasWholeWord(typed, name);
}

function isWordChar(char: string | undefined): boolean {
  return char !== undefined && /[\p{L}\p{N}]/u.test(char);
}

function hasWholeWord(text: string, word: string): boolean {
  const haystack = text.normalize('NFC').toLowerCase(),
    needle = word.normalize('NFC').toLowerCase();
  let at = haystack.indexOf(needle);
  while (at !== -1) {
    if (!isWordChar(haystack[at - 1]) && !isWordChar(haystack[at + needle.length])) {
      return true;
    }
    at = haystack.indexOf(needle, at + 1);
  }
  return false;
}

function hasConsent(call: Call, destinations: string[]): boolean {
  if (!call.owner?.requested) {
    return false;
  }
  return destinations.every((destination) => isNamedVerbatim(call, destination));
}

function isStanding(policy: Policy, call: Call, destination: string, allows: Rule[]): boolean {
  if (destination === 'owner' || destination === call.replyTarget) {
    return true;
  }
  if (policy.knownContacts.includes(destination)) {
    return true;
  }
  return allows.some((rule) =>
    (rule.destinations ?? []).some((pattern) => isGlobMatch(pattern, destination)),
  );
}

// the decision pipeline, in the order the design fixes
export function getDecision(policy: Policy, call: Call, ledger: Ledger): Decision {
  const tool = findTool(policy, call.tool);
  if (!tool) {
    return { outcome: 'deny', stage: 'registry', detail: 'unknown tool' };
  }
  if (call.toolList && !call.toolList.includes(call.tool)) {
    return { outcome: 'deny', stage: 'scope', detail: 'tool not on the job list' };
  }
  const matched = policy.rules.filter((rule) => isRuleMatch(policy, rule, call)),
    denies = matched.filter((rule) => rule.outcome === 'deny');
  if (denies.length > 0) {
    return { outcome: 'deny', stage: 'rules', rule: pickFirstId(denies) };
  }
  const effects = getEffects(policy, call),
    amount = tool.amountArg === undefined ? 0 : Number(readArg(call.args, tool.amountArg) ?? 0),
    allows = matched.filter((rule) => rule.outcome === 'allow'),
    gated = effects.filter((effect) => ALWAYS_ASK.has(effect));
  if (gated.length > 0) {
    const lift = allows.find(
      (rule) => rule.lift !== undefined && hasBudgetRoom(policy, ledger, rule.lift, amount),
    );
    if (!lift) {
      return { outcome: 'ask', stage: 'always_ask', cause: 'always_ask', detail: gated.join(',') };
    }
  }
  const destinations = getDestinations(policy, call),
    consent = hasConsent(call, destinations),
    outside = destinations.filter((destination) => !isStanding(policy, call, destination, allows));
  if (outside.length > 0 && !consent) {
    return {
      outcome: 'ask',
      stage: 'destinations',
      cause: 'outside_steering',
      detail: outside.join(','),
    };
  }
  const asks = matched.filter((rule) => rule.outcome === 'ask');
  if (asks.length > 0) {
    return { outcome: 'ask', stage: 'rules', rule: pickFirstId(asks), cause: 'ask_rule' };
  }
  if (allows.length > 0) {
    return { outcome: 'allow', stage: 'rules', rule: pickFirstId(allows) };
  }
  if (consent) {
    return { outcome: 'allow', stage: 'consent' };
  }
  return { outcome: 'ask', stage: 'no_match', cause: 'no_rule' };
}

// the deciding rule is the lowest ID among matches of the winning outcome, so
// the record does not depend on rule order
function pickFirstId(rules: Rule[]): string {
  return rules.map((rule) => rule.id).toSorted()[0] ?? '';
}

// canonical JSON: sorted keys, no whitespace, NFC strings
export function toCanonical(value: unknown): string {
  if (typeof value === 'string') {
    return JSON.stringify(value.normalize('NFC'));
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => toCanonical(item)).join(',')}]`;
  }
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .toSorted(([a], [b]) => (a < b ? -1 : 1));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${toCanonical(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sortSet<T>(items: T[] | undefined): T[] | undefined {
  if (!items) {
    return undefined;
  }
  const unique = new Map(items.map((item) => [toCanonical(item), item]));
  return [...unique].toSorted(([a], [b]) => (a < b ? -1 : 1)).map(([, item]) => item);
}

// set-valued fields sort, so an equivalent rule always has one form
export function normalizeRule(rule: Rule): Rule {
  return {
    ...rule,
    tools: sortSet(rule.tools),
    effects: sortSet(rule.effects),
    contexts: sortSet(rule.contexts),
    jobs: sortSet(rule.jobs),
    destinations: sortSet(rule.destinations),
    checks: sortSet(
      rule.checks?.map((check) =>
        check.op === 'in' ? { ...check, values: sortSet(check.values) ?? [] } : check,
      ),
    ),
  };
}

export function normalizeMarkdown(text: string): string {
  const lines = text
    .replace(/^﻿/u, '')
    .replaceAll('\r\n', '\n')
    .replaceAll('\r', '\n')
    .normalize('NFC')
    .split('\n');
  return `${lines.join('\n').replace(/\n+$/u, '')}\n`;
}

export function getSha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export interface Definitions {
  persona: string;
  jobs: { id: string; schedule: string; instructions: string; tools: string[] }[];
  policy: Policy;
}

export function buildSnapshotHash(defs: Definitions): string {
  const form = {
    format: 1,
    persona: getSha256(normalizeMarkdown(defs.persona)),
    jobs: defs.jobs
      .map((job) => ({
        id: job.id,
        schedule: job.schedule,
        instructions: getSha256(normalizeMarkdown(job.instructions)),
        tools: sortSet(job.tools),
      }))
      .toSorted((a, b) => (a.id < b.id ? -1 : 1)),
    policy: {
      rules: defs.policy.rules
        .map((rule) => normalizeRule(rule))
        .toSorted((a, b) => (a.id < b.id ? -1 : 1)),
      tools: defs.policy.tools
        .map((tool) => ({
          ...tool,
          effects: sortSet(tool.effects),
          destinationArgs: sortSet(tool.destinationArgs),
        }))
        .toSorted((a, b) => (a.name < b.name ? -1 : 1)),
      budgets: defs.policy.budgets.toSorted((a, b) => (a.id < b.id ? -1 : 1)),
      knownContacts: sortSet(defs.policy.knownContacts),
    },
  };
  return getSha256(toCanonical(form));
}

// pattern a covers pattern b when every string b matches, a matches too;
// conservative: false whenever coverage is not certain
export function hasGlobCover(a: string, b: string): boolean {
  if (a === b || a === '*') {
    return true;
  }
  if (!b.includes('*')) {
    return isGlobMatch(a, b);
  }
  const parts = a.split('*');
  if (parts.length === 2) {
    const [prefix = '', suffix = ''] = parts,
      bParts = b.split('*');
    return (bParts[0] ?? '').startsWith(prefix) && (bParts.at(-1) ?? '').endsWith(suffix);
  }
  return false;
}

function setCovers<T>(wide: T[] | undefined, narrow: T[] | undefined): boolean {
  if (!wide) {
    return true;
  }
  if (!narrow) {
    return false;
  }
  return narrow.every((item) => wide.includes(item));
}

function hasPatternCover(wide: string[] | undefined, narrow: string[] | undefined): boolean {
  if (!wide) {
    return true;
  }
  if (!narrow) {
    return false;
  }
  return narrow.every((item) => wide.some((pattern) => hasGlobCover(pattern, item)));
}

// whether check `strong` isImplied check `weak` on the same argument
function isImplied(strong: Check, weak: Check): boolean {
  if (strong.arg !== weak.arg) {
    return false;
  }
  const strongValues: unknown[] | undefined =
    strong.op === 'eq' ? [strong.value] : strong.op === 'in' ? strong.values : undefined;
  switch (weak.op) {
    case 'eq': {
      return strongValues?.length === 1 && strongValues[0] === weak.value;
    }
    case 'in': {
      return (
        strongValues !== undefined &&
        strongValues.every((value) => weak.values.includes(value as string))
      );
    }
    case 'matches': {
      if (strong.op === 'matches') {
        return hasGlobCover(weak.pattern, strong.pattern);
      }
      return (
        strongValues !== undefined &&
        strongValues.every((value) => typeof value === 'string' && isGlobMatch(weak.pattern, value))
      );
    }
    default: {
      return false;
    }
  }
}

// every call that `narrow` matches, `wide` matches too
export function hasRuleCover(wide: Rule, narrow: Rule): boolean {
  if (wide.cel !== undefined || narrow.cel !== undefined) {
    return false;
  }
  if ((wide.expiresAt ?? Infinity) < (narrow.expiresAt ?? Infinity)) {
    return false;
  }
  if (!hasPatternCover(wide.tools, narrow.tools)) {
    return false;
  }
  if (!setCovers(wide.contexts, narrow.contexts) || !setCovers(wide.jobs, narrow.jobs)) {
    return false;
  }
  if (!hasPatternCover(wide.destinations, narrow.destinations)) {
    return false;
  }
  if (
    !(wide.checks ?? []).every((weak) =>
      (narrow.checks ?? []).some((strong) => isImplied(strong, weak)),
    )
  ) {
    return false;
  }
  return true;
}

// for an allow rule, more effects match more calls; for deny and ask, the same
function hasEffectCover(wide: Rule, narrow: Rule): boolean {
  return setCovers(wide.effects, narrow.effects);
}

function isLiftWithin(wide: Lift | undefined, narrow: Lift | undefined): boolean {
  if (!narrow) {
    return true;
  }
  if (!wide) {
    return false;
  }
  return narrow.budget === wide.budget && narrow.perAction <= wide.perAction;
}

export type EditKind = 'narrows' | 'widens' | 'unchanged';

// classify one rule edit: `before` or `after` may be absent for an add or a removal
export function getEditKind(before: Rule | undefined, after: Rule | undefined): EditKind {
  if (!before && !after) {
    return 'unchanged';
  }
  if (!before && after) {
    return after.outcome === 'allow' ? 'widens' : 'narrows';
  }
  if (before && !after) {
    return before.outcome === 'allow' ? 'narrows' : 'widens';
  }
  if (!before || !after) {
    return 'widens';
  }
  if (toCanonical(normalizeRule(before)) === toCanonical(normalizeRule(after))) {
    return 'unchanged';
  }
  const rank: Record<Outcome, number> = { allow: 0, ask: 1, deny: 2 };
  if (before.outcome === after.outcome) {
    if (after.outcome === 'allow') {
      const inside =
        hasRuleCover(before, after) &&
        hasEffectCover(before, after) &&
        isLiftWithin(before.lift, after.lift);
      return inside ? 'narrows' : 'widens';
    }
    const outside = hasRuleCover(after, before) && hasEffectCover(after, before);
    return outside ? 'narrows' : 'widens';
  }

  // a stricter outcome over the same or a wider match set narrows
  if (rank[after.outcome] > rank[before.outcome]) {
    const outside =
      hasRuleCover(after, before) &&
      (before.outcome === 'allow'
        ? hasEffectCover(before, after) || hasEffectCover(after, before)
        : hasEffectCover(after, before));
    return outside ? 'narrows' : 'widens';
  }
  return 'widens';
}
