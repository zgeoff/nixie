import type { PhoneProvider, ProviderText } from '../types';

export interface FakeText {
  readonly from: string;
  readonly body: string;

  // epoch ms; the fake's time now when left out
  readonly receivedAt?: number;
}

export interface FakeSentText {
  readonly messageID: string;
  readonly to: string;
  readonly body: string;

  // epoch ms, the time the fake created the text
  readonly createdAt: number;
}

export type FakeSendFault =
  | { readonly kind: 'refuse'; readonly reason: string }

  // the call throws before the fake creates the text
  | { readonly kind: 'throw_before' }

  // the fake creates the text and the call throws, so the outcome is unknown
  | { readonly kind: 'throw_after' };

export interface FakePhoneProvider extends PhoneProvider {
  // puts one text in the number's inbox, and returns it as the provider holds it
  readonly deliver: (text: FakeText) => ProviderText;
  readonly readSent: () => readonly FakeSentText[];

  // makes the next send fail as the fault says
  readonly failNextSend: (fault: FakeSendFault) => void;

  // makes the next read of the inbox throw
  readonly failNextRead: (reason: string) => void;

  // puts a text in the sent list as if the number had sent it, with no send call
  readonly addSent: (
    text: Omit<FakeSentText, 'messageID' | 'createdAt'> & { createdAt?: number },
  ) => FakeSentText;
}

export interface FakePhoneProviderOptions {
  readonly now: () => number;
}

// A phone provider in memory, the stand-in for a real one. Its message IDs are unique within it,
// and a text's time is the time of the call unless the test sets one.
export function buildFakePhoneProvider(options: FakePhoneProviderOptions): FakePhoneProvider {
  const inbox: ProviderText[] = [];
  const sent: FakeSentText[] = [];
  const sendFaults: FakeSendFault[] = [];
  const readFaults: string[] = [];
  let count = 0;

  const buildMessageID = (prefix: string) => {
    count += 1;

    return `${prefix}${String(count).padStart(6, '0')}`;
  };

  const settle = <Result>(read: () => Result): Promise<Result> => {
    const reason = readFaults.shift();

    return reason === undefined ? Promise.resolve(read()) : Promise.reject(new Error(reason));
  };

  const addSent: FakePhoneProvider['addSent'] = (text) => {
    const created: FakeSentText = {
      messageID: buildMessageID('SMs'),
      to: text.to,
      body: text.body,
      createdAt: text.createdAt ?? options.now(),
    };

    sent.push(created);

    return created;
  };

  return {
    deliver: (text) => {
      const stored: ProviderText = {
        messageID: buildMessageID('SMr'),
        from: text.from,
        body: text.body,
        receivedAt: text.receivedAt ?? options.now(),
        precisionMs: 1,
      };

      inbox.push(stored);

      return stored;
    },
    readSent: () => [...sent],
    failNextSend: (fault) => {
      sendFaults.push(fault);
    },
    failNextRead: (reason) => {
      readFaults.push(reason);
    },
    addSent,
    readRecent: () =>
      settle(() => {
        const newest = Math.max(...inbox.map((text) => text.receivedAt));

        return inbox.filter((text) => text.receivedAt === newest);
      }),
    readInbound: (sinceMs) =>
      settle(() =>
        inbox
          .filter((text) => text.receivedAt >= sinceMs)
          .toSorted((left, right) => left.receivedAt - right.receivedAt),
      ),
    send: (request) => {
      const fault = sendFaults.shift();

      if (fault?.kind === 'refuse') {
        return Promise.resolve({ kind: 'refused', reason: fault.reason });
      }

      if (fault?.kind === 'throw_before') {
        return Promise.reject(new Error('the provider could not be reached'));
      }

      const created = addSent(request);

      return fault?.kind === 'throw_after'
        ? Promise.reject(new Error('the provider answered nothing'))
        : Promise.resolve({ kind: 'sent', messageID: created.messageID });
    },
    readSentTexts: (query) =>
      Promise.resolve(
        sent
          .filter(
            (text) =>
              text.to === query.to &&
              text.body === query.body &&
              text.createdAt >= query.fromMs &&
              text.createdAt <= query.untilMs,
          )
          .map((text) => ({
            messageID: text.messageID,
            createdAt: text.createdAt,
            precisionMs: 1,
          })),
      ),
  };
}
