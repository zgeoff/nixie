import { decodeBodyBytes } from './decode-body-bytes';
import { decodeCharset } from './decode-charset';

export function decodeBodyText(body: string, encoding: string, charset: string): string {
  return decodeCharset(decodeBodyBytes(body, encoding), charset);
}
