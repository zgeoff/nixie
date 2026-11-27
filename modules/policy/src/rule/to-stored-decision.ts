import type { Decision } from '@heynixie/log';
import type { DecisionDetail, PolicyCall } from '../types';

// The log keeps the first release's shape for `rule` and adds optional keys, so the release before
// still parses every record. The snapshot is the envelope's own hash, and the destinations sit in
// the record's erasable fields.
export function toStoredDecision(detail: DecisionDetail, call: PolicyCall): Decision {
  return {
    outcome: detail.outcome,
    stage: detail.stage,
    rule: detail.rule === null ? null : { id: detail.rule.id, revision: detail.rule.revision },
    ...(detail.rule === null || detail.rule.others.length === 0
      ? {}
      : { ruleOthers: [...detail.rule.others] }),
    ...(detail.cause === undefined ? {} : { cause: detail.cause }),
    ...(detail.conditionErrors === undefined
      ? {}
      : {
          conditionErrors: detail.conditionErrors.map((error) => ({
            ruleID: error.ruleID,
            revision: error.revision,
            code: error.code,
          })),
        }),
    ...(detail.defect === undefined ? {} : { defect: detail.defect }),
    ...(detail.destinations.length > 0
      ? { permissions: detail.destinations.map((entry) => entry.permission) }
      : {}),
    ...(detail.places === undefined
      ? {}
      : { places: detail.places.map((place) => ({ ...place })) }),
    ...(detail.consent === undefined
      ? {}
      : {
          consentCheck: {
            messageSequences: [...detail.consent.messageSequences],
            codeCheck: detail.consent.codeCheck,
            checker: detail.consent.checker,
          },
        }),
    ...(detail.fault === undefined ? {} : { fault: detail.fault }),
    ...(detail.lift === undefined ? {} : { lift: { ...detail.lift } }),
    inputs: {
      toolList: [...call.toolList],
      context: call.context,
      definitionID: call.definitionID,
      sources: [...call.sources],
      turnMessageSequence: call.turnMessageSequence,
      onBehalfOf: [...call.onBehalfOf],
      ...(call.effects === undefined ? {} : { effects: [...call.effects] }),
      ...(call.placeEffects === undefined ? {} : { placeEffects: [...call.placeEffects] }),
    },
  };
}
