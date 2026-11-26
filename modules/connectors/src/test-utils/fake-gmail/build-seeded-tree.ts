import { buildSeededTextPart } from './build-seeded-text-part';
import type { FakeMailSeed } from './create-fake-gmail';
import type { FakePart } from './parse-fake-raw';

// The body parts of a seed: one text part, or an alternative of 2, beside a part for each file.
export function buildSeededTree(mail: FakeMailSeed): FakePart {
  const bodies: FakePart[] = [
    ...(mail.text === undefined ? [] : [buildSeededTextPart('text/plain', mail.text, '0.0')]),
    ...(mail.html === undefined ? [] : [buildSeededTextPart('text/html', mail.html, '0.1')]),
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
