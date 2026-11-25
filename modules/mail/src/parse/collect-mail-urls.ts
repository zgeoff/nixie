import { mailURLPattern } from './mail-url-pattern';

// The addresses in a mail's text, each once, in the order they first appear.
export function collectMailURLs(text: string): string[] {
  return [...new Set([...text.matchAll(mailURLPattern)].map((match) => match[0]))];
}
