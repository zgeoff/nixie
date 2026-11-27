import type { BodyFields } from '@heynixie/connections';
import type { JSONObject } from '@heynixie/log';
import { formatCardNames } from './format-card-names';

// The approval card of a wake rule: the match in a sentence.
export function buildGmailWakeFields(input: JSONObject): BodyFields {
  const parts: string[] = [];
  const from: unknown = input['from'];

  if (Array.isArray(from)) {
    parts.push(`from ${formatCardNames(from)}`);
  }

  if (typeof input['subject'] === 'string') {
    parts.push(`subject ${JSON.stringify(input['subject'])}`);
  }

  if (typeof input['thread'] === 'string') {
    parts.push(`thread ${input['thread']}`);
  }

  const match = parts.length === 0 ? 'every mail' : parts.join(', ');
  const expires = typeof input['expires'] === 'string' ? `, for ${input['expires']}` : '';

  return {
    status: 'fields',
    fields: {},
    sentence: `Wake the assistant on Gmail mail matching ${match}${expires}`,
    approveLabel: 'Set wake rule',
  };
}
