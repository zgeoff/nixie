import type {
  ConsentCheck,
  DecisionLift,
  DecisionPlace,
  DestinationPermission,
} from '@heynixie/log';
import type { ConsentFacts } from '../consent/check-consent';
import { alwaysAskEffects } from '../effect/always-ask-effects';
import { isActionHeldMemoryTool } from '../memory/is-action-held-memory-tool';
import { pickEntriesOfCall } from '../memory/pick-entries-of-call';
import { findPlace } from '../place/find-place';
import { formatPlaceKey } from '../place/format-place-key';
import { isPlaceAllowing } from '../place/is-place-allowing';
import { isReadingCall } from '../place/is-reading-call';
import { parsePlace } from '../place/parse-place';
import type {
  AllowingRule,
  AskCause,
  ConditionError,
  DecisionDetail,
  DecisionPoint,
  Effect,
  EffectDeclaration,
  NamingRule,
  PolicyCall,
  PolicyDecision,
  PolicyInputs,
  PolicyOutcome,
  PolicyStage,
  Rule,
  RuleCall,
  RuleEntry,
  RuleOutcome,
  StageProgress,
} from '../types';
import { getFixedRules } from './get-fixed-rules';
import { isRuleMatch, matchRule } from './is-rule-match';
import { isToolNamed } from './is-tool-named';
import type { FoundDestination } from './pick-destination-permissions';
import { pickDestinationPermissions } from './pick-destination-permissions';
import { pickLift } from './pick-lift';
import { pickRuleOutcome } from './pick-rule-outcome';
import { renderDenySentence } from './render-deny-sentence';

export interface DecisionPointOptions {
  // the declarations in code, which a snapshot's declaration overrides
  readonly findDeclaration: (tool: string) => EffectDeclaration | null;
  readonly readInputs: (snapshot: string) => Promise<PolicyInputs>;
  readonly findTaskDestinations: (definitionID: string) => readonly string[];
  readonly readConsent: (call: PolicyCall, facts: ConsentFacts) => Promise<ConsentCheck | null>;
}

export function makeDecisionPoint(options: DecisionPointOptions): DecisionPoint {
  return async (call, progress = makeProgress()) => {
    progress.stage = 1;

    const inputs = await options.readInputs(call.snapshot);

    const declared = inputs.tools.get(call.tool) ?? options.findDeclaration(call.tool);

    const declaration =
      declared === null || call.effects === undefined
        ? declared
        : { ...declared, effects: [...new Set([...declared.effects, ...call.effects])] };

    if (declaration === null || declaration.effects.length === 0) {
      return buildStageDenial(
        call,
        1,
        `The tool ${call.tool} is unknown or has no effect declaration.`,
      );
    }

    progress.stage = 2;

    // a variant such as task.start/sandbox is on the list when its tool is
    const [listed = call.tool] = call.tool.split('/', 1);

    if (!call.toolList.includes(call.tool) && !call.toolList.includes(listed)) {
      return buildStageDenial(call, 2, `The tool ${call.tool} is not on this run's tool list.`);
    }

    return runRuleStages({ options, call, inputs, declaration, progress });
  };
}

function makeProgress(): StageProgress {
  return { stage: 1 };
}

function buildStageDenial(call: PolicyCall, stage: PolicyStage, sentence: string): PolicyDecision {
  return {
    decision: {
      outcome: 'deny',
      stage,
      rule: null,
      destinations: call.destinations.map((destination) => ({
        value: destination.value,
        permission: null,
      })),
      snapshot: call.snapshot,
    },
    sentence,
  };
}

interface StageInput {
  readonly options: DecisionPointOptions;
  readonly call: PolicyCall;
  readonly inputs: PolicyInputs;
  readonly declaration: EffectDeclaration;
  readonly progress: StageProgress;
}

interface StageRun extends StageInput {
  readonly entries: readonly RuleEntry[];
  readonly ruleCall: RuleCall;
  readonly found: readonly FoundDestination[];
}

async function runRuleStages(input: StageInput): Promise<PolicyDecision> {
  const call = input.call;
  const declaration = input.declaration;
  const progress = input.progress;
  const entries = pickEntriesOfCall([...getFixedRules(), ...input.inputs.rules], call);
  const ruleCall = buildRuleCall(input);
  const found = collectDestinations(call, input.inputs);
  const placeEffects = call.placeEffects ?? declaration.effects;
  const run: StageRun = { ...input, entries, ruleCall, found };
  const pickEntry = makeEntryPicker(entries, ruleCall);
  const answers = makeConsentReader(run);

  progress.stage = 3;

  // a blocked place beats every rule, mandate and lift
  const blocked = found.find((entry) => entry.place?.trust === 'blocked');

  if (blocked?.place !== undefined && blocked.place !== null) {
    return buildDecision(
      run,
      3,
      {
        outcome: 'deny',
        places: [{ placeID: blocked.place.placeID, shortID: blocked.place.shortID }],
      },
      renderPlaceDenySentence(blocked.place.shortID),
    );
  }

  const denied = pickEntry('deny');

  if (denied !== null) {
    return buildDecision(
      run,
      3,
      { outcome: 'deny', verdict: denied },
      renderDenySentence(denied.entry),
    );
  }

  progress.stage = 4;

  const asking = declaration.effects.filter((effect) => alwaysAskEffects.has(effect));
  const lift = asking.length === 0 ? null : pickLift(entries, ruleCall, declaration, asking);

  if (asking.length > 0 && lift === null) {
    return buildDecision(run, 4, { outcome: 'ask', cause: 'always_ask' }, null);
  }

  progress.stage = 5;

  const allowing = entries.filter(
    (entry) => entry.rule.outcome === 'allow' && isRuleMatch(entry.rule, ruleCall),
  );

  const permissions = pickDestinationPermissions(found, {
    isReadingCall: isReadingCall(placeEffects),
    taskDestinations:
      call.definitionID === null ? [] : run.options.findTaskDestinations(call.definitionID),
    allowRules: allowing,
  });

  const hasUncovered = permissions.some((permission) => permission === null);

  if (hasUncovered) {
    const consent = await answers.read();

    if (!isConsentGiven(consent)) {
      return buildDecision(
        run,
        5,
        { outcome: 'ask', cause: 'outside_steering', permissions, consent },
        null,
      );
    }
  }

  progress.stage = 6;

  // a deny whose condition errored never refuses the call unseen: this stage counts it as an ask
  // rule with the cause condition_error
  const asked = pickAskVerdict(entries, ruleCall);

  if (asked !== null) {
    return buildDecision(
      run,
      6,
      {
        outcome: 'ask',
        cause: asked.isErroredDeny ? 'condition_error' : 'ask_rule',
        verdict: asked.verdict,
        permissions,
        consent: answers.peek(),
      },
      null,
    );
  }

  progress.stage = 7;

  const isDestinationless = declaration.requiresDestination === true && found.length === 0;
  const allowingPlaces = isDestinationless ? null : pickAllowingPlaces(found, placeEffects);

  if (allowingPlaces !== null) {
    return buildDecision(
      run,
      7,
      { outcome: 'allow', permissions, consent: answers.peek(), places: allowingPlaces },
      null,
    );
  }

  const allowed = isDestinationless ? null : pickEntry('allow');

  if (allowed !== null) {
    return buildDecision(
      run,
      7,
      { outcome: 'allow', verdict: allowed, permissions, consent: answers.peek(), lift },
      null,
    );
  }

  progress.stage = 8;

  if (declaration.effects.includes('memory_write')) {
    if (!isActionHeldMemoryTool(call.tool)) {
      return buildDecision(run, 8, { outcome: 'gate' }, null);
    }

    progress.stage = 9;

    return buildDecision(run, 9, { outcome: 'ask', cause: 'no_rule', permissions }, null);
  }

  const consent = await answers.read();

  if (!isDestinationless && isConsentGiven(consent)) {
    return buildDecision(run, 8, { outcome: 'allow', permissions, consent }, null);
  }

  progress.stage = 9;

  return buildDecision(run, 9, { outcome: 'ask', cause: 'no_rule', permissions, consent }, null);
}

function buildRuleCall(run: StageInput): RuleCall {
  return {
    tool: run.call.tool,
    effects: run.declaration.effects,
    context: run.call.context,
    task: run.call.definitionID,
    args: run.call.args,
    contentArgs: run.declaration.content.map((name) => name.split(/[.[]/u, 1)[0] ?? name),
    destinations: run.call.destinations.map((destination) => destination.value),
    sources: run.call.sources,
    at: run.call.at,
  };
}

function collectDestinations(call: PolicyCall, inputs: PolicyInputs): readonly FoundDestination[] {
  return call.destinations.map((destination) => {
    const parsed = parsePlace(destination.value);

    return {
      destination,
      isParsed: parsed !== null,
      place: findPlace(inputs.places, { parsed, raw: destination.value }),
    };
  });
}

interface EntryVerdict {
  readonly entry: RuleEntry;
  readonly others: readonly string[];
}

function makeEntryPicker(
  entries: readonly RuleEntry[],
  ruleCall: RuleCall,
): (outcome: RuleOutcome) => EntryVerdict | null {
  return (outcome) => {
    const rules: readonly Rule[] = entries
      .filter((entry) => entry.rule.outcome === outcome)
      .map((entry) => entry.rule);

    const verdict = pickRuleOutcome(rules, ruleCall);
    const entry = entries.find((candidate) => candidate.id === verdict?.ruleID);

    return verdict === null || entry === undefined ? null : { entry, others: verdict.others };
  };
}

interface ConsentReader {
  readonly read: () => Promise<ConsentCheck | null>;
  readonly peek: () => ConsentCheck | null;
}

// Stage 5 and stage 8 share one answer, so the checker runs at most once per call.
function makeConsentReader(run: StageRun): ConsentReader {
  let held: { readonly consent: ConsentCheck | null } | null = null;

  const facts: ConsentFacts = {
    declaration: run.declaration,
    contacts: run.inputs.places
      .filter((place) => place.trust === 'known')
      .map((place) => ({
        contactID: place.placeID,
        name: place.name,
        destination: formatPlaceKey(place.key),
      })),
  };

  return {
    read: async () => {
      held ??= { consent: await run.options.readConsent(run.call, facts) };

      return held.consent;
    },
    peek: () => held?.consent ?? null,
  };
}

interface Verdict {
  readonly outcome: PolicyOutcome;
  readonly verdict?: EntryVerdict;
  readonly cause?: AskCause;
  readonly permissions?: readonly (DestinationPermission | null)[];
  readonly consent?: ConsentCheck | null;
  readonly lift?: DecisionLift | null;
  readonly places?: readonly DecisionPlace[];
}

function buildDecision(
  run: StageRun,
  stage: PolicyStage,
  verdict: Verdict,
  sentence: string | null,
): PolicyDecision {
  const call = run.call;
  const conditionErrors = collectConditionErrors(run.entries, run.ruleCall);

  const detail: DecisionDetail = {
    outcome: verdict.outcome,
    stage,
    rule:
      verdict.verdict === undefined
        ? null
        : {
            id: verdict.verdict.entry.id,
            revision: verdict.verdict.entry.revision,
            others: verdict.verdict.others,
          },
    ...(verdict.cause === undefined ? {} : { cause: verdict.cause }),
    ...(isDirectRequest(verdict, stage) ? { defect: 'direct_request' as const } : {}),
    destinations: call.destinations.map((destination, index) => ({
      value: destination.value,
      permission: verdict.permissions?.[index] ?? null,
    })),
    ...(verdict.consent === undefined || verdict.consent === null
      ? {}
      : { consent: verdict.consent }),
    ...(verdict.places === undefined ? {} : { places: verdict.places }),
    snapshot: call.snapshot,
    ...(conditionErrors.length === 0 ? {} : { conditionErrors }),
    ...(verdict.lift === undefined || verdict.lift === null ? {} : { lift: verdict.lift }),
  };

  const naming =
    verdict.outcome === 'allow' && verdict.verdict !== undefined ? listNamingRules(run) : [];

  return {
    decision: detail,
    sentence,
    ...(naming.length === 0 ? {} : { namingRules: naming }),
    ...(run.declaration.effects.includes('memory_write')
      ? {
          memoryWrite: {
            allowing: listAllowingRules(run),
            ...(isActionHeldMemoryTool(run.call.tool) ? { holdsAsAction: true as const } : {}),
          },
        }
      : {}),
  };
}

// Every rule whose condition errored on the call, whatever its outcome, by ID.
function collectConditionErrors(
  entries: readonly RuleEntry[],
  ruleCall: RuleCall,
): readonly ConditionError[] {
  return entries
    .toSorted((left, right) => (left.id < right.id ? -1 : 1))
    .flatMap((entry) => {
      const matched = entry.rule.cel === undefined ? null : matchRule(entry.rule, ruleCall);

      return matched?.kind === 'error'
        ? [
            {
              ruleID: entry.id,
              outcome: entry.rule.outcome,
              revision: entry.revision,
              code: matched.code,
              ...(matched.missing === undefined || ruleCall.contentArgs.includes(matched.missing)
                ? {}
                : { missing: matched.missing }),
            },
          ]
        : [];
    });
}

// An ask at stage 5 or 9 that the owner's own words should have settled.
function isDirectRequest(verdict: Verdict, stage: PolicyStage): boolean {
  return (
    verdict.outcome === 'ask' &&
    (stage === 5 || stage === 9) &&
    verdict.consent !== undefined &&
    verdict.consent !== null &&
    verdict.consent.codeCheck === 'pass' &&
    verdict.consent.checker !== 'yes'
  );
}

// A pattern such as * matches every tool, so only the exact name lets a rule speak for one tool.
function listNamingRules(run: StageRun): readonly NamingRule[] {
  return listMatchedAllowEntries(run)
    .filter((entry) => isToolNamed(entry.rule, run.call.tool))
    .map((entry) => ({ id: entry.id, revision: entry.revision }));
}

function listMatchedAllowEntries(run: StageRun): readonly RuleEntry[] {
  const matched = run.entries.filter(
    (entry) => entry.rule.outcome === 'allow' && isRuleMatch(entry.rule, run.ruleCall),
  );

  return matched
    .map((entry) => entry.id)
    .toSorted()
    .flatMap((id) => matched.find((entry) => entry.id === id) ?? []);
}

// In the order pickRuleOutcome names a rule, so the first is the rule the decision names.
function listAllowingRules(run: StageRun): readonly AllowingRule[] {
  return listMatchedAllowEntries(run).map((entry) => ({
    id: entry.id,
    revision: entry.revision,
    checks: entry.rule.checks ?? [],
  }));
}

function renderPlaceDenySentence(shortID: string): string {
  return `Not allowed: you blocked the place ${shortID}.`;
}

function isConsentGiven(consent: ConsentCheck | null): boolean {
  return consent !== null && consent.codeCheck === 'pass' && consent.checker === 'yes';
}

interface AskVerdict {
  readonly verdict: EntryVerdict;
  readonly isErroredDeny: boolean;
}

// A deny rule whose condition errored decides the ask ahead of any ask rule, whatever the IDs. The
// lowest ID among those decides, or among the matching ask rules when no deny errored, and the
// others are listed.
function pickAskVerdict(entries: readonly RuleEntry[], ruleCall: RuleCall): AskVerdict | null {
  const erroredDenies = entries
    .filter(
      (entry) => entry.rule.outcome === 'deny' && matchRule(entry.rule, ruleCall).kind === 'error',
    )
    .toSorted(compareByID);

  const asks = entries
    .filter((entry) => entry.rule.outcome === 'ask' && isRuleMatch(entry.rule, ruleCall))
    .toSorted(compareByID);

  const [first, ...rest] = [...erroredDenies, ...asks];

  return first === undefined
    ? null
    : {
        verdict: { entry: first, others: rest.map((entry) => entry.id) },
        isErroredDeny: erroredDenies.length > 0,
      };
}

function compareByID(left: RuleEntry, right: RuleEntry): number {
  return left.id < right.id ? -1 : 1;
}

// Every destination's place allows the call, and a call with no destination never passes. Each
// place is listed once.
function pickAllowingPlaces(
  found: readonly FoundDestination[],
  effects: readonly Effect[],
): readonly DecisionPlace[] | null {
  const places = found.map((entry) => entry.place);

  if (places.length === 0 || places.some((place) => place === null)) {
    return null;
  }

  const held = places.filter((place) => place !== null);

  if (!held.every((place) => isPlaceAllowing(place.trust, effects))) {
    return null;
  }

  return [...new Map(held.map((place) => [place.placeID, place])).values()].map((place) => ({
    placeID: place.placeID,
    shortID: place.shortID,
  }));
}
