import type { ContractClient, ContractOutputs } from '@heynixie/contract';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useNixieClient } from '../utils/use-nixie-client';
import type { RecordRef } from './build-activity';

type Payload = ContractOutputs['records']['readPayload'];

export type ReadablePayload = Extract<Payload, { status: 'readable' }>;

export interface WholePayloads {
  readonly failure: string | null;
  readonly isLoading: boolean;

  // the whole payload of each record the control loaded, by the record's sequence; held in memory
  // only
  readonly payloads: ReadonlyMap<number, ReadablePayload>;

  readonly onLoad: () => void;
}

// Loads the whole payload of each record in `targets`. The page shows the cut values until every
// one loads, so a failure keeps the cut value on show.
export function useWholePayloads(targets: readonly RecordRef[]): WholePayloads {
  const client = useNixieClient().client;
  const [payloads, setPayloads] = useState<ReadonlyMap<number, ReadablePayload>>(new Map());
  const [failure, setFailure] = useState<string | null>(null);

  const load = useMutation({
    mutationFn: () => readWholePayloads(client, targets),
    onMutate: () => {
      setFailure(null);
    },
    onSuccess: (result) => {
      setFailure(result.failure);
      setPayloads((current) => result.payloads ?? current);
    },
  });

  return {
    failure,
    isLoading: load.isPending,
    onLoad: () => {
      load.mutate();
    },
    payloads,
  };
}

interface WholeRead {
  readonly failure: string | null;
  readonly payloads: ReadonlyMap<number, ReadablePayload> | null;
}

async function readWholePayloads(
  client: ContractClient,
  targets: readonly RecordRef[],
): Promise<WholeRead> {
  try {
    const results = await Promise.all(
      targets.map(async (target) => ({
        payload: await client.records.readPayload(target),
        sequence: target.sequence,
      })),
    );

    const failed = results.find((result) => result.payload.status !== 'readable');

    if (failed !== undefined) {
      return { failure: pickFailure(failed.payload), payloads: null };
    }

    const readable = results.flatMap((result) =>
      result.payload.status === 'readable' ? [[result.sequence, result.payload] as const] : [],
    );

    return { failure: null, payloads: new Map(readable) };
  } catch {
    return { failure: 'The whole value did not load.', payloads: null };
  }
}

function pickFailure(payload: Payload): string {
  return payload.status === 'forgotten'
    ? 'The whole value was forgotten, so only the cut start remains.'
    : 'The whole value cannot be read, so only the cut start remains.';
}
