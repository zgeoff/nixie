import { createHash } from 'node:crypto';
import type { ToolForm } from '../types';
import { formatCanonicalJSON } from './format-canonical-json';

// The pin of a tool form: the SHA-256 of its canonical JSON, such as 'sha256:3b9f…'.
export function hashToolForm(form: ToolForm): string {
  return `sha256:${createHash('sha256').update(formatCanonicalJSON(form)).digest('hex')}`;
}
