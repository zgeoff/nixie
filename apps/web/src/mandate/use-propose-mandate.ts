import { useMutation } from '@tanstack/react-query';
import { useRef } from 'react';
import { describeRuleError } from '../rule/describe-rule-error';
import { useNixieClient } from '../utils/use-nixie-client';

interface MandateRequest {
  readonly title: string;
  readonly rules: readonly Readonly<Record<string, unknown>>[];
  readonly expires: string | undefined;
}

export interface MandateProposer {
  readonly propose: (request: MandateRequest) => void;
  readonly isPending: boolean;
  readonly faults: readonly string[];

  // the end of the proposed mandate once the host took it, or null
  readonly proposedUntil: Date | null;
}

// Proposes a mandate, which waits for the owner's approval like any proposal. A second send of the
// same request reuses its client action ID, so a retry after a lost reply settles once.
export function useProposeMandate(): MandateProposer {
  const client = useNixieClient().client;
  const last = useRef<{ readonly signature: string; readonly clientActionID: string } | null>(null);

  const mutation = useMutation({
    mutationFn: (request: MandateRequest) => {
      const signature = JSON.stringify(request);

      const clientActionID =
        last.current?.signature === signature ? last.current.clientActionID : crypto.randomUUID();

      last.current = { signature, clientActionID };

      return client.rules.proposeMandate({
        title: request.title,
        rules: request.rules.map((rule) => ({ ...rule })),
        ...(request.expires === undefined ? {} : { expires: request.expires }),
        clientActionID,
      });
    },
  });

  return {
    propose: (request) => {
      mutation.mutate(request);
    },
    isPending: mutation.isPending,
    faults: mutation.isError ? describeRuleError(mutation.error) : [],
    proposedUntil: mutation.data?.expires ?? null,
  };
}
