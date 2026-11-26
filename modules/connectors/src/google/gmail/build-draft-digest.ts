import { createHash } from 'node:crypto';

// A fingerprint of a draft's whole raw message: its recipients, subject, body and files. The queued
// send carries it, so a draft that changed after the owner approved it sends nothing.
export function buildDraftDigest(raw: string): string {
  return `sha256:${createHash('sha256').update(raw).digest('hex')}`;
}
