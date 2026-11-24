import { scrubBytes } from './scrub-bytes';

export function scrubText(text: string, forms: readonly string[]): string {
  return Buffer.from(scrubBytes(Buffer.from(text, 'utf8'), forms)).toString('utf8');
}
