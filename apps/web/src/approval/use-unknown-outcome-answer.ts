import type { ContractInputs } from '@heynixie/contract';
import { ORPCError } from '@orpc/client';
import { useMutation } from '@tanstack/react-query';
import { useRef } from 'react';
import { writeWithPasskey } from '../passkey/write-with-passkey';
import { useNixieClient } from '../utils/use-nixie-client';

type Assertion = NonNullable<ContractInputs['approvals']['answerUnknownOutcome']['passkey']>;

type UnknownChoice = ContractInputs['approvals']['answerUnknownOutcome']['choice'];

export type UnknownOutcomeAnswerResult =
  | { readonly status: 'answered' }
  | { readonly status: 'refused' }

  // no passkey is registered, or the prompt was cancelled or failed, so nothing changed
  | { readonly status: 'passkey_failed' };

export interface UnknownOutcomeAnswerer {
  readonly send: (choice: UnknownChoice) => void;
  readonly isPending: boolean;
}

export interface UnknownOutcomeAnswerOptions {
  readonly actionID: string;
  readonly passkeyChoices: readonly UnknownChoice[];
  readonly onResult: (result: UnknownOutcomeAnswerResult) => void;
}

// Answers the question about an action whose outcome is unknown. A choice that takes a passkey asks
// for an assertion unless the session's last tap still covers it, and a second send of the same
// choice reuses its client action ID, so a retry after a lost reply settles once.
export function useUnknownOutcomeAnswer(
  options: UnknownOutcomeAnswerOptions,
): UnknownOutcomeAnswerer {
  const client = useNixieClient().client;

  const last = useRef<{ readonly choice: UnknownChoice; readonly clientActionID: string } | null>(
    null,
  );

  const mutation = useMutation({
    mutationFn: async (choice: UnknownChoice): Promise<UnknownOutcomeAnswerResult> => {
      const clientActionID =
        last.current?.choice === choice ? last.current.clientActionID : crypto.randomUUID();

      last.current = { choice, clientActionID };

      try {
        const answer = (passkey: Assertion | undefined) =>
          client.approvals.answerUnknownOutcome({
            actionID: options.actionID,
            choice,
            clientActionID,
            ...(passkey === undefined ? {} : { passkey }),
          });

        if (options.passkeyChoices.includes(choice)) {
          await writeWithPasskey(
            client,
            { kind: 'unknown_outcome', actionID: options.actionID, choice: 'retry' },
            answer,
          );
        } else {
          await answer(undefined);
        }

        return { status: 'answered' };
      } catch (error) {
        return toRefusal(error);
      }
    },
    onSuccess: options.onResult,
  });

  return {
    send: (choice) => {
      mutation.mutate(choice);
    },
    isPending: mutation.isPending,
  };
}

function toRefusal(error: unknown): UnknownOutcomeAnswerResult {
  // the browser rejects with a DOMException when the person cancels the passkey prompt
  if (error instanceof Error && (error.name === 'NotAllowedError' || error.name === 'AbortError')) {
    return { status: 'passkey_failed' };
  }

  if (error instanceof ORPCError) {
    if (
      error.code === 'NO_PASSKEY' ||
      error.code === 'PASSKEY_FAILED' ||
      error.code === 'PASSKEY_REQUIRED'
    ) {
      return { status: 'passkey_failed' };
    }

    return { status: 'refused' };
  }

  throw error;
}
