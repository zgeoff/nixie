import type {
  ActionAttempt,
  ActionConnector,
  CheckResponse,
  ProviderResponse,
} from '@heynixie/connectors';
import { writeSentMail } from '../store/write-sent-mail';
import type { MailHost, MailToolContext } from '../types';
import { mailToolNames } from './mail-tool-names';
import { parseSendArguments } from './parse-send-arguments';
import type { SendPlan } from './plan-send';
import { planSend } from './plan-send';

// The queue's connectors for the send and the reply. The Message-ID that the action ID makes lets a
// check find a send of unknown outcome at the host, and the send's record and reply rule are written
// once, whichever of the run or the check finds the mail first.
export function buildMailConnectors(
  context: MailToolContext,
  host: MailHost,
): ReadonlyMap<string, ActionConnector> {
  return new Map<string, ActionConnector>(
    [mailToolNames.send, mailToolNames.reply].map((tool) => [
      tool,
      {
        reconcile: { kind: 'check', tool, onNotFound: 'retry' },
        run: (attempt) => runSend(context, host, attempt),
        check: (attempt) => checkSend(context, host, attempt),
      },
    ]),
  );
}

async function runSend(
  context: MailToolContext,
  host: MailHost,
  attempt: ActionAttempt,
): Promise<ProviderResponse> {
  const plan = await readPlan(context, attempt);

  if (plan.status === 'refused') {
    return { kind: 'refused', reason: plan.reason };
  }

  const sent = await host.send(plan.mail);
  const written = await writeSentMail(context, plan.toSentInput(sent.hostMessageID));

  return {
    kind: 'success',
    result: {
      message: written.shortID,
      thread: written.threadShortID,
      replyRule: written.replyRuleShortID,
    },
  };
}

function readPlan(context: MailToolContext, attempt: ActionAttempt): Promise<SendPlan> {
  const parsed = parseSendArguments(attempt.tool, attempt.arguments);

  if (parsed === null) {
    return Promise.resolve({
      status: 'refused',
      reason: 'the arguments of the send are unreadable',
    });
  }

  return planSend(context, { actionID: attempt.actionID, arguments: parsed });
}

async function checkSend(
  context: MailToolContext,
  host: MailHost,
  attempt: ActionAttempt,
): Promise<CheckResponse> {
  const plan = await readPlan(context, attempt);

  if (plan.status === 'refused') {
    return { kind: 'inconclusive' };
  }

  const found = await host.findSent(plan.messageIDHeader);

  if (found === null) {
    return { kind: 'not_found' };
  }

  const written = await writeSentMail(context, plan.toSentInput(found.hostMessageID));

  return {
    kind: 'found',
    result: {
      message: written.shortID,
      thread: written.threadShortID,
      replyRule: written.replyRuleShortID,
    },
  };
}
