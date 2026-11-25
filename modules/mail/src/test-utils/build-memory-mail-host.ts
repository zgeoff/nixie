import { z } from 'zod';
import type { HostChanges, HostCursor, HostMail, MailHost, OutgoingMail } from '../types';

const replySettleMs = 50;
const hostCursorSchema = z.object({ instance: z.string(), count: z.int().min(0) });

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

  // makes the next send put a reply in the inbox before it returns, so the reply reaches the host
  // while nixie has not yet stored the sent mail
  readonly replyDuringNextSend: (reply: (sent: SentMemoryMail) => MemoryMail) => void;
}

export interface MemoryMailHostOptions {
  readonly address: string;
  readonly now: () => number;
}

// A mail host in memory, the stand-in for a real one. Each host takes an ID that its mail IDs carry,
// so a restarted host never repeats an earlier ID, and a cursor from an earlier host reads as a
// resync with every mail of this one.
export function buildMemoryMailHost(options: MemoryMailHostOptions): MemoryMailHost {
  const instance = crypto.randomUUID().slice(0, 8);
  const inbox: HostMail[] = [];
  const replies: ((sent: SentMemoryMail) => MemoryMail)[] = [];
  const sent: SentMemoryMail[] = [];
  const hints: (() => void)[] = [];
  const failures: { reason: string; after: number | undefined }[] = [];

  const writeMail = (raw: Uint8Array): HostMail => {
    const mail: HostMail = {
      hostMessageID: `host-${instance}-${String(inbox.length + 1)}`,
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
    begin: () => Promise.resolve({ instance, count: inbox.length }),
    readChanges: (cursor: HostCursor): Promise<HostChanges> => {
      const failure = failures.shift();

      if (failure !== undefined) {
        const after = failure.after === undefined ? {} : { after: failure.after };

        return Promise.resolve({ kind: 'failed', reason: failure.reason, ...after });
      }

      const read = hostCursorSchema.safeParse(cursor);
      const isOwn = read.success && read.data.instance === instance;
      const from = read.success && isOwn ? read.data.count : 0;

      return Promise.resolve({
        kind: isOwn ? 'changes' : 'resynced',
        cursor: { instance, count: inbox.length },
        mails: inbox.slice(from),
      });
    },
    send: async (mail: OutgoingMail) => {
      const hostMessageID = `sent-${instance}-${String(sent.length + 1)}`;
      const stored = { hostMessageID, raw: mail.raw };

      sent.push(stored);

      const reply = replies.shift();

      if (reply !== undefined) {
        writeMail(buildRaw(options.address, reply(stored)));

        // the host answers a moment after the reply reached it, which a reader that does not wait
        // for the send uses to read the reply first
        await new Promise((resolve) => {
          setTimeout(resolve, replySettleMs);
        });
      }

      return { hostMessageID };
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
    replyDuringNextSend: (reply) => {
      replies.push(reply);
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
