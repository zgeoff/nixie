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
import { readOpenSends } from './read-open-sends';
import { claimSentMessage, settleSendClaim } from './settle-send-claim';

// The queue's connector of phone.send. A send that the provider accepted claims its message, and a
// send of unknown outcome is settled by a read-only look for one unclaimed message to the same
// number with the same body. Every other answer of the look asks the user.
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

  return { kind: 'success', result: { text: shortID } };
}

// How far before an attempt's start the check looks, for the provider's clock and ours.
const clockSlackMs = 60_000;

async function checkSend(
  context: PhoneContext,
  attempt: PhoneActionAttempt,
): Promise<PhoneCheckResponse> {
  const request: TextRequest | null = parseSendArguments(attempt.arguments);

  if (request === null) {
    return { kind: 'inconclusive' };
  }

  const nowMs = context.clock.now();

  const found = await context.provider.readSentTexts({
    ...request,
    fromMs: (attempt.attemptStartedAt ?? nowMs) - clockSlackMs,
    untilMs: nowMs,
  });

  const open = await readOpenSends(context.log, attempt.actionID);

  const settled = await settleSendClaim(context, {
    actionID: attempt.actionID,
    request,
    candidates: found.map((message) => message.messageID),
    open,
  });

  return toCheckResponse(settled);
}

function toCheckResponse(settled: Awaited<ReturnType<typeof settleSendClaim>>): PhoneCheckResponse {
  return settled.kind === 'claimed'
    ? { kind: 'found', result: { text: settled.shortID } }
    : { kind: settled.kind };
}
