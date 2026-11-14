import type { CaptureTag } from './capture-tag';
import { encodeBase64URL } from './encode-base64url';

// the segment after `~in.`
export function encodeCaptureTag(tag: CaptureTag): string {
  return `${tag.captureID}.${encodeBase64URL(tag.sealTo)}`;
}
