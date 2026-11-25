import type {
  ActionAttempt,
  ActionConnector,
  CheckResponse,
  ProviderResponse,
} from '@heynixie/connectors';
import { withHostLock } from '../host/with-host-lock';
import { writeSentMail } from '../store/write-sent-mail';
import type { MailHost, MailToolContext } from '../types';
import { buildSendMessageID } from './build-send-message-id';
import { mailToolNames } from './mail-tool-names';
import { parseSendArguments } from './parse-send-arguments';
import type { SendPlan } from './plan-send';
import { planSend } from './plan-send';

// The queue's connectors for the send and the reply. The Message-ID that the action ID makes lets a
// check find a send of unknown outcome at the host. The host's send and its record sit inside the
// host's lock, so a reply that comes back at once is read after the record exists.
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
  const plan = await readPlan(context, attempt, { isReconcile: false });

  if (plan.status === 'refused') {
    return { kind: 'refused', reason: plan.reason };
  }

  const outgoing = plan.mail;

  if (outgoing === null) {
    return { kind: 'refused', reason: 'the plan of the send holds no mail' };
  }

  return withHostLock<ProviderResponse>(host, async () => {
    const sent = await host.send(outgoing);
    const written = await writeSentMail(context, plan.toSentInput(sent.hostMessageID));

    return {
      kind: 'success',
      result: {
        message: written.shortID,
        thread: written.threadShortID,
        replyRule: written.replyRuleShortID,
      },
    };
  });
}

interface PlanOptions {
  readonly isReconcile: boolean;
}

function readPlan(
  context: MailToolContext,
  attempt: ActionAttempt,
  options: PlanOptions,
): Promise<SendPlan> {
  const parsed = parseSendArguments(attempt.tool, attempt.arguments);

  if (parsed === null) {
    return Promise.resolve({
      status: 'refused',
      reason: 'the arguments of the send are unreadable',
    });
  }

  return planSend(context, {
    actionID: attempt.actionID,
    arguments: parsed,
    isReconcile: options.isReconcile,
  });
}

// Asks the host first, by the Message-ID that the action ID makes, so a send that went out is found
// even when the mail it answered was forgotten since. Only a found send needs the plan.
function checkSend(
  context: MailToolContext,
  host: MailHost,
  attempt: ActionAttempt,
): Promise<CheckResponse> {
  const messageIDHeader = buildSendMessageID(context.settings, attempt.actionID);

  return withHostLock<CheckResponse>(host, async () => {
    const found = await host.findSent(messageIDHeader);

    if (found === null) {
      return { kind: 'not_found' };
    }

    const plan = await readPlan(context, attempt, { isReconcile: true });

    if (plan.status === 'refused') {
      return { kind: 'inconclusive' };
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
  });
}
