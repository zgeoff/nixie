import { z } from 'zod';
import { screenBindingSchema } from './computer-request';

export const computerFailureReasons = [
  'stale_element',
  'page_changed',
  'cross_origin_submit',
  'tab_gone',
  'tab_limit',
  'filled_tab',
  'screen_changed',
  'use_run',
  'use_browser_open',
  'bad_point',
  'bad_keys',
  'no_file',
  'bad_path',
  'too_big',
  'disk_full',
  'no_download',
  'not_text',
  'failed',
] as const;

const outputSchema = z.strictObject({ text: z.string(), isCut: z.boolean() });
const isOk = z.literal(true);
const textSchema = z.string();
const numberSchema = z.number();

const pageBodySchema = z.strictObject({
  url: textSchema,
  status: numberSchema,
  title: textSchema,
  text: textSchema,
  links: z.array(textSchema),
});

const pageReplySchema = z.strictObject({
  kind: z.literal('page'),
  ok: isOk,
  tab: textSchema,
  page: pageBodySchema,
  isDiskNew: z.boolean(),

  // true when the tab shows a CAPTCHA or human check, found from its frames and markers alone
  hasChallenge: z.boolean(),

  // why the page is a bot protection's answer in place of the site's, or null; the guest finds it
  // from the status, headers and body of the navigation that loaded the page
  blocked: textSchema.nullable(),
});

const screenshotReplySchema = z.strictObject({
  kind: z.literal('screenshot'),
  ok: isOk,
  tab: textSchema,
  url: textSchema,
  width: numberSchema,
  height: numberSchema,
  base64: textSchema,
  hasChallenge: z.boolean(),
});

const scrollReplySchema = z.strictObject({
  kind: z.literal('scroll'),
  ok: isOk,
  tab: textSchema,
  url: textSchema,
  width: numberSchema,
  height: numberSchema,
  isAtEnd: z.boolean(),
  base64: textSchema,
});

const focusSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('browser'), tab: textSchema, url: textSchema }),
  z.strictObject({ kind: z.literal('terminal') }),
  z.strictObject({ kind: z.literal('other') }),
]);

const desktopReplySchema = z.strictObject({
  kind: z.literal('desktop'),
  ok: isOk,
  width: numberSchema,
  height: numberSchema,
  focus: focusSchema,
  base64: textSchema,
});

// The picture after a screen scroll or act, with the window that has focus. The input has landed
// when this reply comes, so a picture that could not be taken leaves base64 out rather than fail
// the act.
const screenReplySchema = z.strictObject({
  kind: z.literal('screen'),
  ok: isOk,
  focus: focusSchema,
  base64: textSchema.optional(),
});

const screenTargetReplySchema = z.strictObject({
  kind: z.literal('screen-target'),
  ok: isOk,
  target: screenBindingSchema,

  // the desktop as the owner will see it on the card of a click, which only a click asks for
  base64: textSchema.optional(),
});

const takeoverBegunReplySchema = z.strictObject({ kind: z.literal('takeover-begun'), ok: isOk });

// The sites are scheme and host alone, in the order the browser showed them. The window's text is
// what computer.browser_read returns for a tab, or the terminal's visible lines.
const takeoverNowSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('browser'), tab: textSchema, text: textSchema }),
  z.strictObject({ kind: z.literal('terminal'), text: textSchema }),
  z.strictObject({ kind: z.literal('other') }),
]);

const takeoverEndedReplySchema = z.strictObject({
  kind: z.literal('takeover-ended'),
  ok: isOk,
  origins: z.array(textSchema),
  now: takeoverNowSchema,
});

const runBodySchema = z.strictObject({
  exitCode: numberSchema.nullable(),
  stdout: outputSchema,
  stderr: outputSchema,
  seconds: numberSchema,
  isDiskNew: z.boolean(),
});

const runReplySchema = z.strictObject({ kind: z.literal('run'), ok: isOk, run: runBodySchema });

const fileReplySchema = z.strictObject({
  kind: z.literal('file'),
  ok: isOk,
  name: textSchema,
  base64: textSchema,
  isDiskNew: z.boolean(),
});

const writtenReplySchema = z.strictObject({
  kind: z.literal('written'),
  ok: isOk,
  path: textSchema,
  bytes: numberSchema,
  isDiskNew: z.boolean(),
});

const closedReplySchema = z.strictObject({ kind: z.literal('closed'), ok: isOk });

const failedReplySchema = z.strictObject({
  kind: z.literal('failed'),
  ok: z.literal(false),
  reason: z.enum(computerFailureReasons),
  message: textSchema.optional(),
});

export const computerReplySchema = z.discriminatedUnion('kind', [
  pageReplySchema,
  screenshotReplySchema,
  scrollReplySchema,
  desktopReplySchema,
  screenReplySchema,
  screenTargetReplySchema,
  takeoverBegunReplySchema,
  takeoverEndedReplySchema,
  runReplySchema,
  fileReplySchema,
  writtenReplySchema,
  closedReplySchema,
  failedReplySchema,
]);

export type ComputerReply = z.infer<typeof computerReplySchema>;

export type ComputerFailureReason = (typeof computerFailureReasons)[number];

export type TakeoverNow = z.infer<typeof takeoverNowSchema>;

export type ComputerFocus = z.infer<typeof focusSchema>;
