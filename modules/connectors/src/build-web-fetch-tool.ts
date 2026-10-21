import type { JSONObject, Log } from '@heynixie/log';
import type { ToolDefinition, ToolOutcome, ToolRun } from '@heynixie/tools';
import type { FetchReply } from '@heynixie/wire';
import { parseLinkMarks } from '@heynixie/wire';
import { readLinkTarget } from './read-link-target';
import type { LinkedText } from './render-linked-text';
import { renderLinkedText } from './render-linked-text';
import type { LinkNumbering } from './write-link-numbers';
import { writeLinkNumbers } from './write-link-numbers';

// no required key, since a call names a page by url or by link, and the run checks it names one
const webFetchInput = {
  type: 'object',
  properties: {
    url: { type: 'string', description: 'the https URL of the page; give url or link' },
    link: {
      type: 'string',
      description:
        'the ID of a link a page fetched earlier in this session showed, such as L12; give url ' +
        'or link',
    },
  },
  additionalProperties: false,
};

// x-endorsed marks the fields whose type policy endorses as clean
const webFetchOutput = {
  type: 'object',
  properties: {
    url: { type: 'string' },
    status: { type: 'integer', 'x-endorsed': true },
    contentType: { type: ['string', 'null'] },
    text: { type: ['string', 'null'] },
    isTruncated: { type: 'boolean', 'x-endorsed': true },
    blocked: { type: ['string', 'null'] },
  },
  required: ['url', 'status', 'contentType', 'text', 'isTruncated', 'blocked'],
  additionalProperties: false,
};

const sessionEnded = Symbol('session ended');

export interface WebFetchToolOptions {
  // the log whose writer holds the link store
  readonly log: Pick<Log, 'writer'>;

  // the most bytes of text a result holds once its links read as IDs and hosts
  readonly textBytes: number;
}

// Builds the web fetch tool, which fetches one public HTTPS page through the fetch sandbox, direct,
// with every result field outside content and only the status and the truncated mark endorsed. A
// page's links read as IDs the session numbered, whose targets the link store keeps.
export function buildWebFetchTool(
  readPage: (url: string) => Promise<FetchReply>,
  options: WebFetchToolOptions,
): ToolDefinition {
  const log = options.log;

  return {
    name: 'web_fetch',
    description:
      'Fetches one public https page and returns its final URL, status code, content type and ' +
      'text: the readable text of an HTML page, the text of another text type, and no text for ' +
      'a binary type. Each link in the text reads as its ID, such as [L12], with its host when ' +
      'it leaves the site, such as [L40 · example.org]; pass the ID as link to fetch that page. ' +
      'An ID lasts for this session only. isTruncated is true when the page passed a size ' +
      "limit. blocked is null, or the reason the site's bot protection answered in place of " +
      'the page, which no retry passes.',
    input: webFetchInput,
    output: webFetchOutput,
    declaration: {
      effects: ['fetch'],
      destinations: [],
      amount: null,
      content: [],
      results: {
        url: 'untrusted',
        status: 'untrusted',
        contentType: 'untrusted',
        text: 'untrusted',
        isTruncated: 'untrusted',
        blocked: 'untrusted',
      },
    },
    execution: 'direct',
    run: async (call, context) => {
      const session = getLinkSession(context.run);

      const target = await readTargetURL(log, call.input, session.sessionKey);

      if (target.status === 'error') {
        return target;
      }

      const reply = await readPage(target.url);

      if (reply.kind !== 'page') {
        return { status: 'error', message: reply.reason };
      }

      const linked =
        reply.text === null
          ? { text: null, isCut: false }
          : await writeLinkedText(
              log,
              { url: reply.url, text: reply.text, links: reply.links },
              { ...session, textBytes: options.textBytes },
            );

      if (linked === sessionEnded) {
        return {
          status: 'error',
          message: 'the session ended while the page was fetched, so fetch it again by its url',
        };
      }

      return {
        status: 'ok',
        result: {
          url: reply.url,
          status: reply.status,
          contentType: reply.contentType,
          text: linked.text,
          isTruncated: reply.isTruncated || linked.isCut,
          blocked: reply.blocked,
        },
      };
    },
  };
}

type LinkSession = Omit<LinkNumbering, 'urls'>;

// a call under the run's own token runs in no conversation session, so the run keys its links and
// no forget fences them
function getLinkSession(run: ToolRun): LinkSession {
  return {
    sessionKey: run.session?.key ?? run.runID,
    thread: run.thread,
    invalidatedThrough: run.session?.invalidatedThrough ?? null,
  };
}

type TargetURL =
  | { readonly status: 'ok'; readonly url: string }
  | Exclude<ToolOutcome, { status: 'ok' }>;

async function readTargetURL(
  log: Pick<Log, 'writer'>,
  input: JSONObject,
  sessionKey: string,
): Promise<TargetURL> {
  const target = pickTarget(input);

  if (target.kind !== 'link') {
    return target.kind === 'url'
      ? { status: 'ok', url: target.url }
      : { status: 'error', message: target.message };
  }

  const linkURL = await readLinkTarget(log, { sessionKey, number: target.number });

  return linkURL === null
    ? {
        status: 'error',
        message:
          `L${target.number} is not a link from this session. An ID works only in the session ` +
          'whose page showed it, so fetch that page again by its url.',
      }
    : { status: 'ok', url: linkURL };
}

type Target =
  | { readonly kind: 'url'; readonly url: string }
  | { readonly kind: 'link'; readonly number: number }
  | { readonly kind: 'refused'; readonly message: string };

function pickTarget(input: JSONObject): Target {
  const url = input['url'];
  const link = input['link'];

  if (typeof url === 'string' && link === undefined) {
    return { kind: 'url', url };
  }

  if (typeof link !== 'string' || url !== undefined) {
    return { kind: 'refused', message: 'give either the url of a page or the ID of a link' };
  }

  const number = parseLinkID(link);

  return number === null
    ? { kind: 'refused', message: `${link} is not a link ID; an ID reads like L12` }
    : { kind: 'link', number };
}

function parseLinkID(link: string): number | null {
  const digits = /^\[?L(?<number>\d{1,15})(?: · [^\]]*)?\]?$/iu.exec(link.trim())?.groups?.[
    'number'
  ];

  return digits === undefined ? null : Number(digits);
}

// a page's final URL, its text with a mark where each link ends, and each link's target
interface MarkedPage {
  readonly url: string;
  readonly text: string;
  readonly links: readonly string[];
}

async function writeLinkedText(
  log: Pick<Log, 'writer'>,
  page: MarkedPage,
  session: LinkSession & { readonly textBytes: number },
): Promise<LinkedText | typeof sessionEnded> {
  const parts = parseLinkMarks(page.text);

  const urls = parts.flatMap((part) => {
    const target = typeof part === 'string' ? undefined : page.links[part.link];

    return target === undefined ? [] : [target];
  });

  const numbers = await writeLinkNumbers(log, {
    sessionKey: session.sessionKey,
    thread: session.thread,
    invalidatedThrough: session.invalidatedThrough,
    urls,
  });

  return numbers === null
    ? sessionEnded
    : renderLinkedText(
        parts,
        { pageURL: page.url, targets: page.links, numbers },
        session.textBytes,
      );
}
