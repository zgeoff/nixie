import type { ConsentCheck, DecisionLift, DestinationPermission } from '@heynixie/log';
import type { ConsentFacts } from '../consent/check-consent';
import { alwaysAskEffects } from '../effect/always-ask-effects';
import { isActionHeldMemoryTool } from '../memory/is-action-held-memory-tool';
import { pickEntriesOfCall } from '../memory/pick-entries-of-call';
import type {
  AllowingRule,
  DecisionDetail,
  DecisionPoint,
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
import { isRuleMatch } from './is-rule-match';
import { isToolNamed } from './is-tool-named';
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

    // a variant such as task.start/atc is on the list when its tool is
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

interface StageRun {
  readonly options: DecisionPointOptions;
  readonly call: PolicyCall;
  readonly inputs: PolicyInputs;
  readonly declaration: EffectDeclaration;
  readonly progress: StageProgress;
}

async function runRuleStages(run: StageRun): Promise<PolicyDecision> {
  const call = run.call;
  const declaration = run.declaration;
  const progress = run.progress;
  const entries = pickEntriesOfCall([...getFixedRules(), ...run.inputs.rules], call);
  const ruleCall = buildRuleCall(run);
  const pickEntry = makeEntryPicker(entries, ruleCall);
  const answers = makeConsentReader(run);

  progress.stage = 3;

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

  const permissions = pickDestinationPermissions(call.destinations, {
    ownerDestinations: run.inputs.ownerDestinations,
    contacts: run.inputs.contacts,
    taskDestinations: [
      ...(call.definitionID === null ? [] : run.options.findTaskDestinations(call.definitionID)),
      ...(call.taskDestinations ?? []),
    ],
    allowRules: allowing.map((entry) => entry.rule),
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

  const asked = pickEntry('ask');

  if (asked !== null) {
    return buildDecision(
      run,
      6,
      { outcome: 'ask', cause: 'ask_rule', verdict: asked, permissions, consent: answers.peek() },
      null,
    );
  }

  progress.stage = 7;

  const allowed = pickEntry('allow');

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

  if (isConsentGiven(consent)) {
    return buildDecision(run, 8, { outcome: 'allow', permissions, consent }, null);
  }

  progress.stage = 9;

  return buildDecision(run, 9, { outcome: 'ask', cause: 'no_rule', permissions, consent }, null);
}

function buildRuleCall(run: StageRun): RuleCall {
  return {
    tool: run.call.tool,
    effects: run.declaration.effects,
    context: run.call.context,
    task: run.call.definitionID,
    args: run.call.args,
    destinations: run.call.destinations.map((destination) => destination.value),
    sources: run.call.sources,
    at: run.call.at,
  };
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
  const facts: ConsentFacts = { declaration: run.declaration, contacts: run.inputs.contacts };

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
  readonly cause?: 'outside_steering' | 'always_ask' | 'ask_rule' | 'no_rule';
  readonly permissions?: readonly (DestinationPermission | null)[];
  readonly consent?: ConsentCheck | null;
  readonly lift?: DecisionLift | null;
}

function buildDecision(
  run: StageRun,
  stage: PolicyStage,
  verdict: Verdict,
  sentence: string | null,
): PolicyDecision {
  const call = run.call;

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
    snapshot: call.snapshot,
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
  const ruleCall = buildRuleCall(run);

  const matched = pickEntriesOfCall([...getFixedRules(), ...run.inputs.rules], run.call).filter(
    (entry) => entry.rule.outcome === 'allow' && isRuleMatch(entry.rule, ruleCall),
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

function isConsentGiven(consent: ConsentCheck | null): boolean {
  return consent !== null && consent.codeCheck === 'pass' && consent.checker === 'yes';
}
