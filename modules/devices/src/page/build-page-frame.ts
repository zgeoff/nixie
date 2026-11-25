import type { PageData } from '@heynixie/contract';
import { pageBridgeScript } from './page-bridge-script';

export interface PageFrameInput {
  // the page's markup, which goes in the body
  readonly html: string;

  // the URL of each declared image, by the ID that the page names it
  readonly images: ReadonlyMap<string, string>;

  // the URL prefix that every image URL starts with, which the frame's policy opens to
  readonly imageBase: string;

  // messages that wait for the page's first onMessage, such as its retained message
  readonly initialMessages: readonly PageData[];

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
// URLs and `data:`, because the opaque origin can't use `'self'`. Trusted types route each markup
// string through the bridge's policy, which keeps out the link elements no directive stops.
export function buildPageFrame(input: PageFrameInput): PageFrame {
  const directives = [
    "default-src 'none'",
    "script-src 'unsafe-inline'",
    "style-src 'unsafe-inline'",
    'font-src data:',
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
  };

  const bridge = pageBridgeScript.replaceAll(
    /__(?<slot>IMAGES|INITIAL)__/gu,
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
