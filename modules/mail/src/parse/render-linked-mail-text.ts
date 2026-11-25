import { mailURLPattern } from './mail-url-pattern';

// The text of a mail with each address in it replaced by its tag, such as `[L4 · example.org/x]`. An
// address with no tag stays as it is.
export function renderLinkedMailText(text: string, tags: ReadonlyMap<string, string>): string {
  return text.replaceAll(mailURLPattern, (url) => tags.get(url) ?? url);
}
