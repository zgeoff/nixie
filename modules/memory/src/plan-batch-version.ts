import { memoryWriterTaskID } from './memory-writer-task-id';
import { planRememberedVersion } from './plan-remembered-version';
import { planRetiredVersion } from './plan-retired-version';
import type { Provenance } from './types';
import type { VersionPlan } from './write-version-in-transaction';
import type { GateVerdict, StagedWrite } from './writer-types';

export function planBatchVersion(
  write: StagedWrite,
  verdict: Extract<GateVerdict, { readonly outcome: 'apply' }>,
): VersionPlan {
  const provenance: Provenance = {
    origin: 'memory_writer',
    source: verdict.source,
    taskID: memoryWriterTaskID,
    proposalID: null,
    checks: verdict.checks,
    model: verdict.model,
    thread: memoryWriterTaskID,
  };

  if (write.op === 'retire') {
    return planRetiredVersion({
      target: write.target,
      provenance,
      intentQuote: write.quote,
      intentEvidence: verdict.evidence,
    });
  }

  return planRememberedVersion({
    text: write.text,
    provenance,
    evidenceQuote: write.quote,
    evidence: verdict.evidence,
    ...(write.target === null ? { subject: write.subject } : { target: write.target }),
  });
}
