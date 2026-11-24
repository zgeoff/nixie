import type { ValueForm } from './build-value-forms';
import { scrubBytes } from './scrub-bytes';

export function scrubText(text: string, forms: readonly ValueForm[]): string {
  return Buffer.from(scrubBytes(Buffer.from(text, 'utf8'), forms)).toString('utf8');
}
