import type { LogRecord } from '@heynixie/log';
import { mailWokeFieldsSchema, triggerMailWokeCodec } from '@heynixie/tasks';
import { mintBlockID, renderSystemMessage, renderUntrustedText } from '@heynixie/wire';
import { formatMessageTime } from '../message/format-message-time';
import type { MessageTimeOptions } from '../types';

// What a target reads when mail that its wake rules matched arrives. The sender and the subject of
// each mail are outside content, so they sit inside the markers that a page read shows. A wake whose
// fields were erased shows each mail as forgotten.
export function renderMailWoke(
  record: LogRecord,
  times: MessageTimeOptions,
  mint: () => string = mintBlockID,
): string {
  const woke = triggerMailWokeCodec.decode(record.payload);
  const texts = collectMailTexts(record);
  const count = woke.mails.length;
  const lines: string[] = [];

  for (const rule of woke.rules) {
    lines.push(`Wake rule ${rule.shortID} (${describeRule(rule, times)}).`);
  }

  lines.push(`${String(count)} new ${count === 1 ? 'mail' : 'mails'}:`);

  for (const mail of woke.mails) {
    const text = texts.get(mail.arrived);

    if (text === undefined) {
      lines.push(`(forgotten) (message ${mail.messageID})`);
    } else {
      lines.push(...renderUntrustedText(text, mint), `(message ${mail.messageID})`);
    }
  }

  return renderSystemMessage({
    type: 'mail',
    at: formatMessageTime(record.recordedAt, null, times),
    body: lines.join('\n'),
  });
}

// The text of each mail by the sequence of its arrival, or none once the fields are erased.
function collectMailTexts(record: LogRecord): ReadonlyMap<number, string> {
  const texts = new Map<number, string>();

  if (record.erasable.status !== 'readable') {
    return texts;
  }

  const fields = mailWokeFieldsSchema.safeParse(record.erasable.fields);

  for (const mail of fields.success ? fields.data.mails : []) {
    texts.set(mail.arrived, `from ${mail.from}: ${mail.subject}`);
  }

  return texts;
}

type WokeRule = ReturnType<typeof triggerMailWokeCodec.decode>['rules'][number];

function describeRule(rule: WokeRule, times: MessageTimeOptions): string {
  const parts: string[] = [];

  if (rule.match.from !== undefined) {
    parts.push(`mail from ${rule.match.from.join(', ')}`);
  }

  if (rule.match.subject !== undefined) {
    parts.push(`subject ${JSON.stringify(rule.match.subject)}`);
  }

  if (rule.match.thread !== undefined) {
    parts.push(`thread ${rule.match.thread}`);
  }

  const match = parts.length === 0 ? 'every mail' : parts.join(', ');

  return rule.expiresAt === null
    ? match
    : `${match}, until ${formatMessageTime(new Date(rule.expiresAt), null, times)}`;
}
