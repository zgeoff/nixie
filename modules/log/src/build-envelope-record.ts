import { decisionSchema } from './decision-schema';
import { parseJSONObject } from './parse-json-object';
import type { EnvelopeRecord, RecordRow } from './types';

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
    decision: row.decision === null ? null : decisionSchema.parse(JSON.parse(row.decision)),
    promptCause: row.prompt_cause,
    approval:
      row.proposal_id === null || row.approval_id === null || row.action_hash === null
        ? null
        : { proposalID: row.proposal_id, approvalID: row.approval_id, actionHash: row.action_hash },
    payload: parseJSONObject(row.payload),
  };
}
