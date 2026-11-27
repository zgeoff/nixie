import { toErrorFields } from '@heynixie/logger';
import { withHostLock } from '../host/with-host-lock';
import { writeSentMail } from '../store/write-sent-mail';
import type {
  MailActionAttempt,
  MailActionConnector,
  MailCheckResponse,
  MailHost,
  MailProviderResponse,
  MailToolContext,
} from '../types';
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
): ReadonlyMap<string, MailActionConnector> {
  return new Map<string, MailActionConnector>(
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
  attempt: MailActionAttempt,
): Promise<MailProviderResponse> {
  const plan = await readPlan(context, attempt, { isReconcile: false });

  if (plan.status === 'refused') {
    return { kind: 'refused', reason: plan.reason };
  }

  const outgoing = plan.mail;

  if (outgoing === null) {
    return { kind: 'refused', reason: 'the plan of the send holds no mail' };
  }

  return withHostLock<MailProviderResponse>(host, async () => {
    try {
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
    } catch (error) {
      // A host that took the mail and then failed already holds it, and a reply to it may be in the
      // inbox: write its record and rule before the lock lets the source read.
      await writeFoundSend(context, host, attempt).catch((writeError: unknown) => {
        context.logEvent('mail.send_record_failed', {
          actionID: attempt.actionID,
          ...toErrorFields(writeError),
        });
      });

      throw error;
    }
  });
}

interface PlanOptions {
  readonly isReconcile: boolean;
}

function readPlan(
  context: MailToolContext,
  attempt: MailActionAttempt,
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
async function writeFoundSend(
  context: MailToolContext,
  host: MailHost,
  attempt: MailActionAttempt,
): Promise<MailCheckResponse> {
  const messageIDHeader = buildSendMessageID(context.settings, attempt.actionID);

  const found = await host.readSentTexts(messageIDHeader);

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
}

function checkSend(
  context: MailToolContext,
  host: MailHost,
  attempt: MailActionAttempt,
): Promise<MailCheckResponse> {
  return withHostLock<MailCheckResponse>(host, () => writeFoundSend(context, host, attempt));
}
