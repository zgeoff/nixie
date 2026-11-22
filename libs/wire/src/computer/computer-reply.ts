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
});

const screenshotReplySchema = z.strictObject({
  kind: z.literal('screenshot'),
  ok: isOk,
  tab: textSchema,
  url: textSchema,
  width: numberSchema,
  height: numberSchema,
  base64: textSchema,
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

// the picture after a screen scroll or act, with the window that has focus
const screenReplySchema = z.strictObject({
  kind: z.literal('screen'),
  ok: isOk,
  focus: focusSchema,
  base64: textSchema,
});

const screenTargetReplySchema = z.strictObject({
  kind: z.literal('screen-target'),
  ok: isOk,
  target: screenBindingSchema,
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
  runReplySchema,
  fileReplySchema,
  writtenReplySchema,
  closedReplySchema,
  failedReplySchema,
]);

export type ComputerReply = z.infer<typeof computerReplySchema>;

export type ComputerFailureReason = (typeof computerFailureReasons)[number];

export type ComputerFocus = z.infer<typeof focusSchema>;
