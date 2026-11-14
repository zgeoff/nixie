import type { CaptureTag } from './capture-tag';
import { captureIDPattern } from './capture-tag';
import { isP256Point } from './is-p256-point';
import { parseBase64URL } from './parse-base64url';

export function decodeCaptureTag(segment: string): CaptureTag | null {
  const parts = segment.split('.');

  if (parts.length !== 2) {
    return null;
  }

  const [captureID = '', encodedKey = ''] = parts;

  if (!captureIDPattern.test(captureID)) {
    return null;
  }

  const sealTo = parseBase64URL(encodedKey);

  return sealTo !== null && isP256Point(sealTo) ? { captureID, sealTo } : null;
}
