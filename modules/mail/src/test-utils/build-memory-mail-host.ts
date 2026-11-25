import type { HostChanges, HostCursor, HostMail, MailHost, OutgoingMail } from '../types';

export interface MemoryMail {
  readonly from: string;
  readonly to?: string;
  readonly subject: string;
  readonly text: string;

  // the Message-ID header without its angle brackets
  readonly messageID?: string;

  // the IDs that the mail answers
  readonly references?: readonly string[];

  // replaces the plain text body with an HTML body
  readonly html?: string;
}

export interface SentMemoryMail {
  readonly hostMessageID: string;
  readonly raw: Uint8Array;
}

export interface MemoryMailHost extends MailHost {
  // puts one mail in the inbox, received at the host's time now
  readonly deliver: (mail: MemoryMail) => HostMail;

  // puts a mail that is written out in full in the inbox
  readonly deliverRaw: (raw: Uint8Array) => HostMail;
  readonly readSent: () => readonly SentMemoryMail[];

  // makes the next read fail
  readonly failNextRead: (reason: string, after?: number) => void;
}

export interface MemoryMailHostOptions {
  readonly address: string;
  readonly now: () => number;
}

// A mail host in memory, the stand-in for a real one. Its cursor is the count of mail that it held
// when the reader last read it.
export function buildMemoryMailHost(options: MemoryMailHostOptions): MemoryMailHost {
  const inbox: HostMail[] = [];
  const sent: SentMemoryMail[] = [];
  const hints: (() => void)[] = [];
  const failures: { reason: string; after: number | undefined }[] = [];

  const writeMail = (raw: Uint8Array): HostMail => {
    const mail: HostMail = {
      hostMessageID: `host-${String(inbox.length + 1)}`,
      receivedAt: options.now(),
      raw,
    };

    inbox.push(mail);

    for (const hint of hints.splice(0)) {
      hint();
    }

    return mail;
  };

  return {
    begin: () => Promise.resolve(inbox.length),
    readChanges: (cursor: HostCursor): Promise<HostChanges> => {
      const failure = failures.shift();

      if (failure !== undefined) {
        const after = failure.after === undefined ? {} : { after: failure.after };

        return Promise.resolve({ kind: 'failed', reason: failure.reason, ...after });
      }

      const from = typeof cursor === 'number' ? cursor : 0;

      return Promise.resolve({ kind: 'changes', cursor: inbox.length, mails: inbox.slice(from) });
    },
    send: (mail: OutgoingMail) => {
      const hostMessageID = `sent-${String(sent.length + 1)}`;

      sent.push({ hostMessageID, raw: mail.raw });

      return Promise.resolve({ hostMessageID });
    },
    findSent: (messageIDHeader) => {
      const found = sent.find((mail) =>
        Buffer.from(mail.raw).toString('latin1').includes(`Message-ID: <${messageIDHeader}>`),
      );

      const hostMessage = found === undefined ? null : { hostMessageID: found.hostMessageID };

      return Promise.resolve(hostMessage);
    },
    watch: async function* watch(signal: AbortSignal) {
      while (!signal.aborted) {
        await new Promise<void>((resolve) => {
          hints.push(resolve);

          signal.addEventListener(
            'abort',
            () => {
              resolve();
            },
            { once: true },
          );
        });

        if (!signal.aborted) {
          yield;
        }
      }
    },
    deliver: (mail) => writeMail(buildRaw(options.address, mail)),
    deliverRaw: writeMail,
    readSent: () => sent,
    failNextRead: (reason, after) => {
      failures.push({ reason, after });
    },
  };
}

function buildRaw(address: string, mail: MemoryMail): Uint8Array {
  const references = (mail.references ?? []).map((id) => `<${id}>`);
  const [nearest] = references;

  const headers = [
    ...(mail.messageID === undefined ? [] : [`Message-ID: <${mail.messageID}>`]),
    `From: ${mail.from}`,
    `To: ${mail.to ?? address}`,
    `Subject: ${mail.subject}`,
    ...(nearest === undefined
      ? []
      : [`In-Reply-To: ${nearest}`, `References: ${references.join(' ')}`]),
    `Content-Type: ${mail.html === undefined ? 'text/plain' : 'text/html'}; charset=utf-8`,
  ];

  return Buffer.from(`${headers.join('\r\n')}\r\n\r\n${mail.html ?? mail.text}\r\n`, 'utf8');
}
