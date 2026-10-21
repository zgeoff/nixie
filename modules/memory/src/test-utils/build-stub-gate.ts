import type {
  GateBatch,
  GateVerdict,
  SourceMessage,
  StagedWrite,
  WriterGate,
} from '../writer-types';

export function buildStubGate(): WriterGate {
  return {
    check: (write, source, batch) => Promise.resolve(buildStubVerdict(write, source, batch)),

    release: () => Promise.resolve(),
  };
}

function buildStubVerdict(
  write: StagedWrite,
  source: SourceMessage,
  batch: GateBatch,
): GateVerdict {
  const start = source.text.indexOf(write.quote);

  if (write.quote === '' || start === -1) {
    return {
      outcome: 'propose',
      reason: 'the quote is not in its source',
      records: [
        {
          kind: 'test.proposal',
          definitions: { snapshotHash: 'sha256:test' },
          thread: 'memory-writer',
          payload: { sourceSequence: source.sequence },
        },
      ],
      plan: null,
    };
  }

  return {
    outcome: 'apply',
    source: 'owner',
    checks: { quote: 'exact' },
    evidence: { recordSequence: source.sequence, start, end: start + write.quote.length },
    model: batch.model,
  };
}
