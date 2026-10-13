import type { GateVerdict, SourceMessage, StagedWrite, WriterGate } from '../writer-types';

// A stand-in for the memory checks' content gate. It applies a write whose quote appears word for
// word in its source message, with the quote's place as the evidence, and holds every other write
// as a proposal with one test record, as the real gate holds a write it cannot check.
export function buildStubGate(): WriterGate {
  return {
    check: (write, source) => Promise.resolve(buildStubVerdict(write, source)),

    // the stub creates no key, so nothing it made outlives a batch
    release: () => Promise.resolve(),
  };
}

function buildStubVerdict(write: StagedWrite, source: SourceMessage): GateVerdict {
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
    };
  }
  return {
    outcome: 'apply',
    source: 'owner',
    checks: { quote: 'exact' },
    evidence: { recordSequence: source.sequence, start, end: start + write.quote.length },
  };
}
