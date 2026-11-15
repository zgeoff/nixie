import type { ContractInputs, ContractOutputs } from '@heynixie/contract';
import { ORPCError } from '@orpc/client';
import { useMutation } from '@tanstack/react-query';
import { useRef } from 'react';
import { z } from 'zod';
import { useNixieClient } from '../utils/use-nixie-client';

type ApprovalAnswerInput = Omit<ContractInputs['approvals']['answerProposal'], 'clientActionID'>;

type ApprovalAnswerResult = ContractOutputs['approvals']['answerProposal'];

export type ApprovalOutcome =
  | { readonly status: 'answered'; readonly result: ApprovalAnswerResult }
  | { readonly status: 'conflict' }
  | { readonly status: 'closed' }
  | { readonly status: 'refused'; readonly reason: string };

export interface ApprovalAnswerer {
  readonly send: (input: ApprovalAnswerInput) => void;
  readonly isPending: boolean;

  // true when the answer failed before the host settled it, so a second tap sends it again
  readonly isFailed: boolean;
}

export interface ApprovalAnswerOptions {
  readonly onOutcome: (outcome: ApprovalOutcome) => void;
}

// Sends one answer through the checked path. A second send of the same answer reuses its client
// action ID, so a retry after a lost reply settles once.
export function useApprovalAnswer(options: ApprovalAnswerOptions): ApprovalAnswerer {
  const client = useNixieClient().client;
  const last = useRef<{ readonly signature: string; readonly clientActionID: string } | null>(null);

  const mutation = useMutation({
    mutationFn: async (input: ApprovalAnswerInput): Promise<ApprovalOutcome> => {
      const signature = JSON.stringify(input);

      const clientActionID =
        last.current?.signature === signature ? last.current.clientActionID : crypto.randomUUID();

      last.current = { signature, clientActionID };

      try {
        return {
          status: 'answered',
          result: await client.approvals.answerProposal({ ...input, clientActionID }),
        };
      } catch (error) {
        const outcome = toRefusal(error);

        if (outcome === null) {
          throw error;
        }

        return outcome;
      }
    },
    onSuccess: options.onOutcome,
  });

  return {
    send: (input) => {
      mutation.mutate(input);
    },
    isPending: mutation.isPending,
    isFailed: mutation.isError,
  };
}

const refusalSchema = z.object({ reason: z.string() });

function toRefusal(error: unknown): ApprovalOutcome | null {
  if (!(error instanceof ORPCError)) {
    return null;
  }

  if (error.code === 'CONFLICT') {
    return { status: 'conflict' };
  }

  if (error.code === 'CLOSED') {
    return { status: 'closed' };
  }

  if (error.code === 'NOT_ALLOWED') {
    const data = refusalSchema.safeParse(error.data);

    return { status: 'refused', reason: data.success ? data.data.reason : 'not_allowed' };
  }

  return null;
}
