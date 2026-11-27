import { z } from 'zod';
import type { HostChanges, HostCursor, HostMail, MailHost, OutgoingMail } from '../types';
import type { MemoryHostState, SentMemoryMail } from './types';

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

  // the HTML body: the only body when the text is empty, and an alternative to the text otherwise
  readonly html?: string;

  // the files the mail carries
  readonly attachments?: readonly { readonly name: string; readonly content: Uint8Array }[];
}

export interface MemoryMailHost extends MailHost {
  // puts one mail in the inbox, received at the host's time now
  readonly deliver: (mail: MemoryMail) => HostMail;

  // puts a mail that is written out in full in the inbox
  readonly deliverRaw: (raw: Uint8Array) => HostMail;
  readonly readSent: () => readonly SentMemoryMail[];

  // makes the next read fail
  readonly failNextRead: (reason: string, after?: number) => void;

  // makes the next send put a reply in the inbox and then wait for `release` before it returns, so
  // the reply reaches the host while nixie has not yet stored the sent mail. Releasing with an
  // error makes the send throw after the host holds the mail.
  readonly replyDuringNextSend: (reply: (sent: SentMemoryMail) => MemoryMail) => {
    readonly release: (failure?: Error) => void;
  };
}

export interface MemoryMailHostOptions {
  readonly address: string;
  readonly now: () => number;

  // the state of an earlier host, which this host continues. Without it, the host starts empty.
  readonly state?: MemoryHostState;

  // told the host's whole state after each change
  readonly onChange?: (state: MemoryHostState) => void;
}

// A mail host in memory, the stand-in for a real one. A host with no earlier state takes an ID that
// its mail IDs carry, so it never repeats another host's ID, and a cursor from another host reads
// as a resync with every mail of this one. A host given an earlier state continues that host.
export function buildMemoryMailHost(options: MemoryMailHostOptions): MemoryMailHost {
  const instance = options.state?.instance ?? crypto.randomUUID().slice(0, 8);
  const inbox: HostMail[] = [...(options.state?.inbox ?? [])];

  const replies: {
    reply: (sent: SentMemoryMail) => MemoryMail;
    released: PromiseWithResolvers<Error | undefined>;
  }[] = [];

  const sent: SentMemoryMail[] = [...(options.state?.sent ?? [])];
  const hints: (() => void)[] = [];
  const failures: { reason: string; after: number | undefined }[] = [];

  const writeState = () => {
    options.onChange?.({ instance, inbox, sent });
  };

  const writeMail = (raw: Uint8Array): HostMail => {
    const mail: HostMail = {
      hostMessageID: `host-${instance}-${String(inbox.length + 1)}`,
      receivedAt: options.now(),
      raw,
    };

    inbox.push(mail);

    writeState();

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

      writeState();

      const planned = replies.shift();

      if (planned !== undefined) {
        writeMail(buildRaw(options.address, planned.reply(stored)));

        const failure = await planned.released.promise;

        if (failure !== undefined) {
          throw failure;
        }
      }

      return { hostMessageID };
    },
    readSentTexts: (messageIDHeader) => {
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
      const released = Promise.withResolvers<Error | undefined>();

      replies.push({ reply, released });

      return {
        release: (failure) => {
          released.resolve(failure);
        },
      };
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
  ];

  const body = buildBodyLines(mail);
  const files = mail.attachments ?? [];

  if (files.length === 0) {
    return Buffer.from(`${[...headers, ...body].join('\r\n')}\r\n`, 'utf8');
  }

  const parts = files.flatMap((file) => [
    '--memory-boundary',
    `Content-Disposition: attachment; filename="${file.name}"`,
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(file.content).toString('base64'),
  ]);

  const lines = [
    ...headers,
    `Content-Type: multipart/mixed; boundary="memory-boundary"`,
    '',
    '--memory-boundary',
    ...body,
    ...parts,
    '--memory-boundary--',
  ];

  return Buffer.from(`${lines.join('\r\n')}\r\n`, 'utf8');
}

// The content headers, a blank line and the body of a mail: plain text, HTML alone, or the two as
// the alternatives of one mail.
function buildBodyLines(mail: MemoryMail): string[] {
  if (mail.html === undefined) {
    return ['Content-Type: text/plain; charset=utf-8', '', mail.text];
  }

  if (mail.text === '') {
    return ['Content-Type: text/html; charset=utf-8', '', mail.html];
  }

  return [
    'Content-Type: multipart/alternative; boundary="memory-alternative"',
    '',
    '--memory-alternative',
    'Content-Type: text/plain; charset=utf-8',
    '',
    mail.text,
    '--memory-alternative',
    'Content-Type: text/html; charset=utf-8',
    '',
    mail.html,
    '--memory-alternative--',
  ];
}
