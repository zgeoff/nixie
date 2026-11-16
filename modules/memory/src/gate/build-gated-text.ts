import type { ContentGateRequest } from './content-gate-request';

// The one text that the hidden-character check and the token check read: the text, then the gist,
// the topic and each trigger phrase of a write that carries labels.
export function buildGatedText(request: Pick<ContentGateRequest, 'text' | 'labelTexts'>): string {
  return [request.text, ...(request.labelTexts ?? [])].join('\n');
}
