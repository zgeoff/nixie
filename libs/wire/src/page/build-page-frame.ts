import { pageBridgeScript } from './page-bridge-script';

// What nixie.data gives for a declared URL in a frame that holds its replies: the response, or the
// code that its rejection carries.
export type PageFetchReply =
  | {
      readonly status: number;
      readonly type: string;
      readonly body: string;
      readonly fetchedAt: string;
    }
  | { readonly error: 'REFUSED' };

export interface PageFrameInput {
  // the page's markup, which goes in the body
  readonly html: string;

  // the URL of each declared image, by the ID that the page names it
  readonly images: ReadonlyMap<string, string>;

  // the URL prefix that every image URL starts with, which the frame's policy opens to
  readonly imageBase: string;

  // messages that wait for the page's first onMessage, such as its retained message
  readonly initialMessages: readonly unknown[];

  // the URL prefix of each package the page names, each ending in a slash, which the frame's policy
  // opens script, style and font loading to
  readonly packageBases: readonly string[];

  // The URLs that the page declared as fetches, which nixie.data answers, and for a frame that no
  // device page serves, the reply held for each. A null reply map asks the device page.
  readonly fetches: {
    readonly declared: readonly string[];
    readonly replies: Readonly<Record<string, PageFetchReply>> | null;
  };

  // true puts the policy in a meta tag, for a frame that a plain file serves
  readonly isPolicyInline: boolean;
}

export interface PageFrame {
  // the policy as a response header carries it, which also seals the document into an opaque origin
  // when it opens on its own
  readonly policy: string;
  readonly document: string;
}

// The sealed page: the document and its content-security policy. Images open only to the declared
// URLs and `data:`, and code, styles and fonts only to the packages the page names. Trusted types
// route each markup string through the bridge's policy.
export function buildPageFrame(input: PageFrameInput): PageFrame {
  const directives = [
    "default-src 'none'",
    ['script-src', "'unsafe-inline'", ...input.packageBases].join(' '),
    ['style-src', "'unsafe-inline'", ...input.packageBases].join(' '),
    ['font-src', ...input.packageBases, 'data:'].join(' '),
    `img-src ${input.imageBase} data:`,
    "connect-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
    "require-trusted-types-for 'script'",
    'trusted-types default',
  ];

  // a sandbox directive in a meta tag is ignored, and a frame that a file serves has the sandbox
  // attribute of its host
  const policy = [...directives, 'sandbox allow-scripts'].join('; ');

  const slots = {
    IMAGES: toScriptJSON(Object.fromEntries(input.images)),
    INITIAL: toScriptJSON(input.initialMessages),
    FETCHES: toScriptJSON(input.fetches),
  };

  const bridge = pageBridgeScript.replaceAll(
    /__(?<slot>IMAGES|INITIAL|FETCHES)__/gu,
    (_match, slot: keyof typeof slots) => slots[slot],
  );

  const meta = input.isPolicyInline
    ? `<meta http-equiv="Content-Security-Policy" content="${directives.join('; ')}">`
    : '';

  const document =
    `<!doctype html><html><head>${meta}<meta charset="utf-8">` +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<style>html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; }</style>' +
    `<script>${bridge}</script></head><body>${input.html}</body></html>`;

  return { policy, document };
}

// JSON that can sit inside a script element: no `</script>` and no line separator ends it early
function toScriptJSON(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll('<', String.raw`\u003c`)
    .replaceAll('\u2028', String.raw`\u2028`)
    .replaceAll('\u2029', String.raw`\u2029`);
}
