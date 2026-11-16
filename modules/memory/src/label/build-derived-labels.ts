import type { Labels, MemorySubject } from '../types';

const gistLength = 80;
const emptyTextGist = 'memory item';

export function buildDerivedLabels(text: string, subject: MemorySubject): Labels {
  const flattened = text.replaceAll(/\s+/gu, ' ').trim();
  const gist = [...flattened].slice(0, gistLength).join('').trim();

  return { gist: gist === '' ? emptyTextGist : gist, topic: subject, triggers: [] };
}
