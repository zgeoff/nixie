import { decodeHTML } from 'entities';

// Kagi marks the query's words in a title or snippet with HTML tags, and escapes characters as HTML
// entities.
export function toPlainText(html: string): string {
  return decodeHTML(html.replaceAll(/<[^>]*>/gu, ''));
}
