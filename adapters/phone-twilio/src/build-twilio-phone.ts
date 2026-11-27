import type { PhoneProvider, ProviderText } from '@heynixie/phone';
import { parseJSONOrNull } from '@heynixie/wire';
import type { TwilioMessage } from './twilio-message-list-schema';
import {
  twilioCreatedSchema,
  twilioErrorSchema,
  twilioMessageListSchema,
} from './twilio-message-list-schema';

export interface TwilioPhoneOptions {
  // adds the API key as HTTP Basic on the host, so the adapter holds none
  readonly fetch: (input: string, init?: RequestInit) => Promise<Response>;

  // the API's origin, such as https://api.twilio.com
  readonly apiURL: string;
  readonly accountSID: string;

  // the assistant's own number, in E.164 form
  readonly number: string;
}

const requestTimeoutMs = 15_000;
const pageSize = 100;

// Twilio stamps each message to the second.
const precisionMs = 1000;

// Twilio sorts its list newest first by the time a message was sent, and nixie keys a text by the
// time Twilio created it, which a late text puts long after its sent time. So a read of the texts
// pages on the sent time alone, and reaches a text sent up to this long before Twilio created it.
const lateTextMs = 24 * 60 * 60_000;

// A read for a send pages on the creation time, because a queued message has no sent time. It goes
// on until a whole page is this much older than the window, so one old message never ends it.
const orderSlackMs = 60_000;

// The phone provider over Twilio's Messages API, which nixie polls. A call that fails to reach
// Twilio throws, and so does a send that Twilio answers with a server error, because that send may
// have gone out. A read pages until it holds every message it wants.
export function buildTwilioPhone(options: TwilioPhoneOptions): PhoneProvider {
  const messagesPath = `/2010-04-01/Accounts/${encodeURIComponent(options.accountSID)}/Messages.json`;

  const readPage = async (
    path: string,
  ): Promise<ReturnType<typeof twilioMessageListSchema.parse>> => {
    const response = await options.fetch(`${options.apiURL}${path}`, {
      signal: AbortSignal.timeout(requestTimeoutMs),
    });

    const text = await response.text();

    const body = parseJSONOrNull(text);

    if (response.status !== 200) {
      throw new Error(`Twilio answered ${String(response.status)} to a read of the message list`);
    }

    return twilioMessageListSchema.parse(body);
  };

  const readMessages = async (
    query: URLSearchParams,
    isDone: (page: readonly TwilioMessage[], read: readonly TwilioMessage[]) => boolean,
  ): Promise<TwilioMessage[]> => {
    const messages: TwilioMessage[] = [];
    let path: string | null = `${messagesPath}?${query.toString()}`;
    let isFinished = false;

    while (path !== null && !isFinished) {
      const page = await readPage(path);

      messages.push(...page.messages);

      isFinished = isDone(page.messages, messages);
      path = page.next_page_uri;
    }

    return messages;
  };

  return {
    readRecent: async () => {
      const query = new URLSearchParams({
        To: options.number,
        PageSize: String(pageSize),
      });

      const messages = await readMessages(query, (page, read) => {
        const newest = Math.max(
          ...read.flatMap((message) => toInboundText(message)).map((text) => text.receivedAt),
        );

        return page.length > 0 && page.every((message) => toSentAt(message) < newest - lateTextMs);
      });

      const texts = messages.flatMap((message) => toInboundText(message));
      const newest = Math.max(...texts.map((text) => text.receivedAt));

      return texts.filter((text) => text.receivedAt === newest);
    },
    readInbound: async (sinceMs) => {
      const query = new URLSearchParams({
        To: options.number,
        PageSize: String(pageSize),
        'DateSent>=': new Date(sinceMs - lateTextMs).toISOString().slice(0, 10),
      });

      // The day filter bounds the list on its own sort key, so the read takes every page it leaves.
      const messages = await readMessages(query, () => false);

      return messages
        .flatMap((message) => toInboundText(message))
        .filter((text) => text.receivedAt >= sinceMs)
        .toSorted((left, right) => left.receivedAt - right.receivedAt);
    },
    send: async (request) => {
      const response = await options.fetch(`${options.apiURL}${messagesPath}`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          To: request.to,
          From: options.number,
          Body: request.body,
        }).toString(),
        signal: AbortSignal.timeout(requestTimeoutMs),
      });

      const text = await response.text();

      const body = parseJSONOrNull(text);

      if (response.status === 201) {
        const created = twilioCreatedSchema.parse(body);

        return { kind: 'sent', messageID: created.sid };
      }

      // A client error other than a rate limit means Twilio created nothing. Every other answer may
      // follow a message that went out.
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        const error = twilioErrorSchema.safeParse(body);

        return {
          kind: 'refused',
          reason:
            error.success && error.data.message !== undefined
              ? error.data.message
              : `Twilio answered ${String(response.status)}`,
        };
      }

      throw new Error(`Twilio answered ${String(response.status)} to a send`);
    },
    readSentTexts: async (query) => {
      // A queued message has no sent time yet, so a filter on the sent time would miss it.
      const search = new URLSearchParams({
        From: options.number,
        To: query.to,
        PageSize: String(pageSize),
      });

      const messages = await readMessages(
        search,
        (page) =>
          page.length > 0 &&
          page.every((message) => toCreatedAt(message) < query.fromMs - orderSlackMs),
      );

      return messages
        .filter((message) => message.direction.startsWith('outbound'))
        .filter((message) => message.body === query.body)
        .flatMap((message) => {
          const createdAt = toCreatedAt(message);

          return createdAt + precisionMs > query.fromMs && createdAt <= query.untilMs
            ? [{ messageID: message.sid, createdAt, precisionMs }]
            : [];
        });
    },
  };
}

// A text's time is the time Twilio created it, which is when a rule that nixie set after it can no
// longer take it: the sent time is the carrier's, and can fall before the rule while Twilio's own
// record of the text comes after.
function toInboundText(message: TwilioMessage): ProviderText[] {
  const receivedAt = Date.parse(message.date_created ?? message.date_sent ?? '');

  return message.direction === 'inbound' && Number.isFinite(receivedAt)
    ? [
        {
          messageID: message.sid,
          from: message.from,
          receivedAt,
          precisionMs,
          body: message.body,
        },
      ]
    : [];
}

// A message with no sent time reads as the newest, so a read never stops at it.
function toSentAt(message: TwilioMessage): number {
  const sentAt = Date.parse(message.date_sent ?? '');

  return Number.isFinite(sentAt) ? sentAt : Number.POSITIVE_INFINITY;
}

// The creation time comes first, because it is the one that a queued message has. A message with no
// time reads as the newest, so a read never stops at it.
function toCreatedAt(message: TwilioMessage): number {
  const createdAt = Date.parse(message.date_created ?? message.date_sent ?? '');

  return Number.isFinite(createdAt) ? createdAt : Number.POSITIVE_INFINITY;
}
