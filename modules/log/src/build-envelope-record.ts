import type { Decision, EnvelopeRecord, JSONObject, RecordRow } from './types';

// Turns a records row into the envelope a projection folds and a reader receives.
export function buildEnvelopeRecord(row: RecordRow): EnvelopeRecord {
  return {
    sequence: row.sequence,
    recordedAt: new Date(row.recorded_at),
    kind: row.kind,
    definitions: {
      snapshotHash: row.snapshot_hash,
      ...(row.persona_version === null ? {} : { personaVersion: row.persona_version }),
      ...(row.job_version === null ? {} : { jobVersion: row.job_version }),
    },
    thread: row.thread,
    stepKey: row.step_key,
    parent: row.parent,
    contentSource: row.content_source,

    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- appendRecord wrote a Decision
    decision: row.decision === null ? null : (JSON.parse(row.decision) as Decision),
    promptCause: row.prompt_cause,
    approval:
      row.proposal_id === null || row.approval_id === null || row.action_hash === null
        ? null
        : { proposalID: row.proposal_id, approvalID: row.approval_id, actionHash: row.action_hash },

    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- appendRecord wrote a JSONObject
    payload: JSON.parse(row.payload) as JSONObject,
  };
}
