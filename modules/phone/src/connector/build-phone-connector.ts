import { readSendClaim } from '../store/read-send-claim';
import type {
  PhoneActionAttempt,
  PhoneActionConnector,
  PhoneCheckResponse,
  PhoneContext,
  PhoneProviderResponse,
  TextRequest,
} from '../types';
import { parseSendArguments } from './parse-send-arguments';
import { phoneToolNames } from './phone-tool-names';
import { claimSentMessage, settleSendClaim } from './settle-send-claim';

// The queue's connector of phone.send. A send that the provider accepted claims its message, and a
// send of unknown outcome is settled by a read-only look for one unclaimed message to the same
// number with the same body. A send that holds a claim sends nothing again.
export function buildPhoneConnector(
  context: PhoneContext,
): ReadonlyMap<string, PhoneActionConnector> {
  return new Map([
    [
      phoneToolNames.send,
      {
        reconcile: { kind: 'check', tool: phoneToolNames.send, onNotFound: 'ask' },
        run: (attempt) => runSend(context, attempt),
        check: (attempt) => checkSend(context, attempt),
      } satisfies PhoneActionConnector,
    ],
  ]);
}

async function runSend(
  context: PhoneContext,
  attempt: PhoneActionAttempt,
): Promise<PhoneProviderResponse> {
  const claimed = await readSendClaim(context.log, attempt.actionID);

  if (claimed !== null) {
    return buildSent(attempt.actionID, claimed);
  }

  const request = parseSendArguments(attempt.arguments);

  if (request === null) {
    return { kind: 'refused', reason: 'SEND_FAILED: the arguments of the send are unreadable' };
  }

  const sent = await context.provider.send(request);

  if (sent.kind === 'refused') {
    return { kind: 'refused', reason: `SEND_FAILED: ${sent.reason}` };
  }

  // A claim that fails to write leaves the send of unknown outcome, which the check settles on the
  // message the provider holds.
  const shortID = await claimSentMessage(context, attempt.actionID, sent.messageID);

  return buildSent(attempt.actionID, shortID);
}

// The outcome holds the sent text's ID, and the action's ID, which a call that finished at once
// returns in no other field.
function buildSent(actionID: string, shortID: string): PhoneProviderResponse {
  return { kind: 'success', result: { text: shortID, action: actionID } };
}

// How far before an attempt's start the check looks, for the provider's clock and ours. A text that
// the provider created in that stretch cannot be told from an earlier send, so it asks the user.
const clockSlackMs = 60_000;

async function checkSend(
  context: PhoneContext,
  attempt: PhoneActionAttempt,
): Promise<PhoneCheckResponse> {
  const claimed = await readSendClaim(context.log, attempt.actionID);

  if (claimed !== null) {
    return { kind: 'found', result: { text: claimed, action: attempt.actionID } };
  }

  const request: TextRequest | null = parseSendArguments(attempt.arguments);

  if (request === null) {
    return { kind: 'inconclusive' };
  }

  const nowMs = context.clock.now();
  const startedAt = attempt.attemptStartedAt ?? nowMs;

  const found = await context.provider.readSentTexts({
    ...request,
    fromMs: startedAt - clockSlackMs,
    untilMs: nowMs,
  });

  const settled = await settleSendClaim(context, {
    actionID: attempt.actionID,
    request,
    attemptStartedAt: startedAt,
    candidates: found,
  });

  return settled.kind === 'claimed'
    ? { kind: 'found', result: { text: settled.shortID, action: attempt.actionID } }
    : { kind: settled.kind };
}
