import type { JSONObject } from '@heynixie/log';

// A text that keeps its end within the limit, with `cut` true when nixie cut its start.
export function toCutText(text: string, limit: number): JSONObject {
  return text.length <= limit
    ? { text, cut: false }
    : { text: text.slice(text.length - limit), cut: true };
}
