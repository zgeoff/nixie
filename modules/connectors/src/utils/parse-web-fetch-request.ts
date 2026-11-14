import type { JSONObject } from '@heynixie/log';

export type PageView =
  | { readonly kind: 'part'; readonly part: number }
  | { readonly kind: 'find'; readonly query: string };

export type WebFetchRequest =
  | { readonly kind: 'url'; readonly url: string; readonly view: PageView }
  | { readonly kind: 'link'; readonly number: number; readonly view: PageView }
  | { readonly kind: 'page'; readonly pageID: string; readonly view: PageView }
  | { readonly kind: 'refused'; readonly message: string };

const mixMessage =
  'give the url of a page or the ID of a link, with an optional part or find; or give the ID ' +
  'of a page this session fetched, with a part or a find';

export function parseWebFetchRequest(input: JSONObject): WebFetchRequest {
  const view = parseView(input['part'], input['find']);

  if (typeof view === 'string') {
    return { kind: 'refused', message: view };
  }

  const url = input['url'];
  const link = input['link'];
  const page = input['page'];
  const targets = [url, link, page].filter((target) => target !== undefined);

  if (targets.length !== 1) {
    return { kind: 'refused', message: mixMessage };
  }

  if (typeof url === 'string') {
    return { kind: 'url', url, view: view ?? { kind: 'part', part: 1 } };
  }

  if (typeof link === 'string') {
    return parseLinkRequest(link, view ?? { kind: 'part', part: 1 });
  }

  if (typeof page !== 'string' || view === null) {
    return { kind: 'refused', message: mixMessage };
  }

  return parseLinkID(page) === null
    ? { kind: 'page', pageID: page.trim(), view }
    : { kind: 'refused', message: `${page} is a link ID, not a page ID, so give it as link` };
}

// a view, null for a call that names neither part nor find, or the message that refuses the call
function parseView(part: unknown, find: unknown): PageView | null | string {
  if (part !== undefined && find !== undefined) {
    return 'give part or find, not both';
  }

  if (part !== undefined) {
    return typeof part === 'number' && Number.isSafeInteger(part) && part >= 1
      ? { kind: 'part', part }
      : 'part is the number of a part, from 1';
  }

  if (find !== undefined) {
    return typeof find === 'string' && find !== ''
      ? { kind: 'find', query: find }
      : 'find is the text to look for, at least one character long';
  }

  return null;
}

function parseLinkRequest(link: string, view: PageView): WebFetchRequest {
  const number = parseLinkID(link);

  if (number !== null) {
    return { kind: 'link', number, view };
  }

  return {
    kind: 'refused',
    message: isPageID(link.trim())
      ? `${link} is a page ID, not a link ID, so give it as page`
      : `${link} is not a link ID; an ID reads like L12`,
  };
}

function parseLinkID(link: string): number | null {
  const digits = /^\[?L(?<number>\d{1,15})(?: · .*)?\]?$/iu.exec(link.trim())?.groups?.['number'];

  return digits === undefined ? null : Number(digits);
}

// the shape of a short ID from the database library: 10 lowercase letters and digits, the first a
// letter
function isPageID(text: string): boolean {
  return /^[a-z][\da-z]{9}$/u.test(text);
}
