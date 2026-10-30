import type { z } from 'zod';
import type { PushPayload, pushInputSchema } from './contract.ts';
import { hashSecret } from './hash-secret.ts';
import type { StoredApproval } from './pick-approval-refusal.ts';

export type PushDelivery<Recipient> =
  | { kind: 'skip' }
  | {
      kind: 'send';
      recipient: Recipient;
      payload: PushPayload;
      // the approval the server keeps for the Approve tap, under its ID
      approval: { approvalID: string; stored: StoredApproval } | null;
    };

interface PushDeliveryInput<Recipient> {
  // the session the push goes to, or undefined once the phone signed out while the push waited
  recipient: Recipient | undefined;
  sessionToken: string;
  push: z.infer<typeof pushInputSchema>;
  pushID: string;
  sentAt: number;
  // random values the caller draws, used only for a push that asks for Approve
  approvalID: string;
  approvalToken: string;
}

// Decides what one subscription gets: nothing for a phone whose session is gone, or a payload with
// an approval whose token only the push carries, and whose hash the server keeps.
export function buildPushDelivery<Recipient>(
  input: PushDeliveryInput<Recipient>,
): PushDelivery<Recipient> {
  if (input.recipient === undefined) {
    return { kind: 'skip' };
  }

  const approval = input.push.approve
    ? {
        approvalID: input.approvalID,
        stored: {
          tokenHash: hashSecret(input.approvalToken),
          sessionToken: input.sessionToken,
          issuedAt: input.sentAt,
          used: false,
        },
      }
    : null;

  return {
    kind: 'send',
    recipient: input.recipient,
    payload: {
      pushID: input.pushID,
      sentAt: input.sentAt,
      title: input.push.title,
      tag: input.push.tag,
      silent: input.push.silent,
      renotify: input.push.renotify,
      urgency: input.push.urgency,
      approval:
        approval === null ? null : { approvalID: input.approvalID, token: input.approvalToken },
    },
    approval,
  };
}
