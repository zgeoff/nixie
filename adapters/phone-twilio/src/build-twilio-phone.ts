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
const maxPages = 50;
const recentPageSize = 20;

// The phone provider over Twilio's Messages API, which nixie polls, so it needs no address that the
// internet can reach. A call that fails to reach Twilio throws, and so does a send that Twilio
// answers with a server error, because that send may have gone out.
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

  const readMessages = async (query: URLSearchParams, limit: number): Promise<TwilioMessage[]> => {
    const messages: TwilioMessage[] = [];
    let path: string | null = `${messagesPath}?${query.toString()}`;

    for (let pages = 0; path !== null && pages < limit; pages += 1) {
      const page = await readPage(path);

      messages.push(...page.messages);

      path = page.next_page_uri;
    }

    return messages;
  };

  return {
    readRecent: async () => {
      const query = new URLSearchParams({ To: options.number, PageSize: String(recentPageSize) });

      const messages = await readMessages(query, 1);

      return messages
        .flatMap((message) => toInboundText(message))
        .toSorted((left, right) => right.receivedAt - left.receivedAt);
    },
    readInbound: async (sinceMs) => {
      const query = new URLSearchParams({
        To: options.number,
        PageSize: String(pageSize),
        'DateSent>=': new Date(sinceMs).toISOString().slice(0, 10),
      });

      const messages = await readMessages(query, maxPages);

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
      const search = new URLSearchParams({
        From: options.number,
        To: query.to,
        PageSize: String(pageSize),
        'DateSent>=': new Date(query.fromMs).toISOString().slice(0, 10),
      });

      const messages = await readMessages(search, maxPages);

      return messages
        .filter((message) => message.direction.startsWith('outbound'))
        .filter((message) => message.body === query.body)
        .filter((message) => {
          const createdAt = Date.parse(message.date_created ?? message.date_sent ?? '');

          return createdAt >= query.fromMs && createdAt <= query.untilMs;
        })
        .map((message) => ({ messageID: message.sid }));
    },
  };
}

function toInboundText(message: TwilioMessage): ProviderText[] {
  const receivedAt = Date.parse(message.date_sent ?? message.date_created ?? '');

  return message.direction === 'inbound' && Number.isFinite(receivedAt)
    ? [{ messageID: message.sid, from: message.from, receivedAt, body: message.body }]
    : [];
}
