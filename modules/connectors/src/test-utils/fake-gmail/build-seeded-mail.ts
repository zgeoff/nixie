import type { FakeMailSeed, StoredMail } from './create-fake-gmail';
import type { FakePart } from './parse-fake-raw';

// The message that a seed stands for: headers from the seed's fields, and one body part, or an
// alternative of 2, beside a part for each file.
export function buildSeededMail(mail: FakeMailSeed, makeID: () => string): StoredMail {
  const id = mail.id ?? makeID();
  const sentAtMs = mail.sentAtMs ?? Date.parse('2026-11-12T23:04:00Z');

  const headers: (readonly [string, string])[] = [
    ['From', mail.from],
    ['To', (mail.to ?? ['me@example.test']).join(', ')],
    ...(mail.cc === undefined ? [] : [['Cc', mail.cc.join(', ')] as const]),
    ...(mail.replyTo === undefined ? [] : [['Reply-To', mail.replyTo] as const]),
    ['Subject', mail.subject],
    ['Date', new Date(sentAtMs).toUTCString()],
    ['Message-ID', `<${mail.messageID ?? `${id}@mail.test`}>`],
  ];

  return {
    id,
    threadID: mail.threadID ?? id,
    labels: [...(mail.labels ?? ['INBOX', 'UNREAD'])],
    internalDateMs: sentAtMs,
    headers,
    root: buildSeededTree(mail),
  };
}

function buildSeededTree(mail: FakeMailSeed): FakePart {
  const bodies: FakePart[] = [
    ...(mail.text === undefined ? [] : [buildTextPart('text/plain', mail.text, '0.0')]),
    ...(mail.html === undefined ? [] : [buildTextPart('text/html', mail.html, '0.1')]),
  ];

  const attachments = (mail.attachments ?? []).map((file, index): FakePart => ({
    partID: String(index + 1),
    mimeType: file.type,
    filename: file.name,
    headers: [['Content-Type', file.type]],
    bytes: file.bytes,
    parts: [],
  }));

  const readable: FakePart =
    bodies.length === 1 && bodies[0] !== undefined
      ? { ...bodies[0], partID: '0' }
      : {
          partID: '0',
          mimeType: 'multipart/alternative',
          filename: '',
          headers: [],
          bytes: new Uint8Array(0),
          parts: bodies,
        };

  return attachments.length === 0
    ? { ...readable, partID: '' }
    : {
        partID: '',
        mimeType: 'multipart/mixed',
        filename: '',
        headers: [],
        bytes: new Uint8Array(0),
        parts: [readable, ...attachments],
      };
}

function buildTextPart(type: string, text: string, partID: string): FakePart {
  return {
    partID,
    mimeType: type,
    filename: '',
    headers: [['Content-Type', `${type}; charset=UTF-8`]],
    bytes: new TextEncoder().encode(text),
    parts: [],
  };
}
