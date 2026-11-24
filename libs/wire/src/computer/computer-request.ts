import { z } from 'zod';

const limitsSchema = z.strictObject({
  bodyBytes: z.number(),
  timeoutMs: z.number(),
  redirects: z.number(),
  textBytes: z.number(),
  imageBytes: z.number(),
});

const clickSchema = z.strictObject({ kind: z.literal('click'), element: z.string() });

const fillSchema = z.strictObject({
  kind: z.literal('fill'),
  element: z.string(),
  value: z.string(),
});

const actSchema = z.discriminatedUnion('kind', [clickSchema, fillSchema]);
const stringListSchema = z.array(z.string());
const acts = z.array(actSchema);

const openSchema = z.strictObject({
  op: z.literal('open'),
  url: z.string(),
  limits: limitsSchema,
  deniedRanges: stringListSchema,
});

// Loads a new address in a tab the browser holds. The ranges are the deployment's, as an open carries.
const navigateSchema = z.strictObject({
  op: z.literal('navigate'),
  tab: z.string(),
  url: z.string(),
  limits: limitsSchema,
  deniedRanges: stringListSchema,
});

const reloadSchema = z.strictObject({
  op: z.literal('reload'),
  tab: z.string(),
  limits: limitsSchema,
});

const readSchema = z.strictObject({
  op: z.literal('read'),
  tab: z.string(),
  mode: z.enum(['text', 'snapshot']),
});

// control is a control ID such as E12; without it the picture is the viewport
const screenshotSchema = z.strictObject({
  op: z.literal('screenshot'),
  tab: z.string(),
  control: z.string().optional(),
});

// to is 'up', 'down' or a control ID such as E12
const scrollSchema = z.strictObject({ op: z.literal('scroll'), tab: z.string(), to: z.string() });

const actRequestSchema = z.strictObject({
  op: z.literal('act'),
  tab: z.string(),
  expectURL: z.string(),
  acts,
  submit: z.boolean(),
});

// The window a screen act binds to. tab is the guest's own tab ID, and url the page that tab holds.
export const screenBindingSchema = z.strictObject({
  windowID: z.string(),
  kind: z.enum(['browser', 'terminal', 'other']),
  tab: z.string().optional(),
  url: z.string().optional(),
});

const screenActSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('click'),
    x: z.number(),
    y: z.number(),
    button: z.enum(['left', 'right']),
  }),
  z.strictObject({ kind: z.literal('text'), text: z.string().max(1000) }),
  z.strictObject({ kind: z.literal('keys'), keys: z.string() }),
]);

// The whole desktop's picture
const desktopShotSchema = z.strictObject({ op: z.literal('desktopShot') });

// by is wheel steps: positive scrolls down, negative up
const screenScrollSchema = z.strictObject({
  op: z.literal('screenScroll'),
  x: z.number(),
  y: z.number(),
  by: z.number(),
});

// Reads the window a screen act would land on: the one under a click's point, or the focused one
// for typing. The guest refuses an act it would never run, so the owner is not asked about it.
const screenBindSchema = z.strictObject({ op: z.literal('screenBind'), act: screenActSchema });

// Runs a screen act when the window it lands on is still the bound one
const screenActRequestSchema = z.strictObject({
  op: z.literal('screenAct'),
  binding: screenBindingSchema,
  act: screenActSchema,
});

// A hold on the desktop begins: the guest starts a list of the sites the browser shows
const takeoverBeginSchema = z.strictObject({ op: z.literal('takeoverBegin') });

// A hold on the desktop ends: the guest answers with the sites the browser showed and the window in
// focus, and stops the list
const takeoverEndSchema = z.strictObject({ op: z.literal('takeoverEnd') });
const closeSchema = z.strictObject({ op: z.literal('close'), tab: z.string() });

const downloadSchema = z.strictObject({
  op: z.literal('download'),
  tab: z.string(),
  element: z.string(),
});

const runSchema = z.strictObject({
  op: z.literal('run'),
  argv: stringListSchema,
  timeoutSeconds: z.number(),
});

const readFileSchema = z.strictObject({ op: z.literal('readFile'), path: z.string() });

// the bytes in base64
const writeFileSchema = z.strictObject({
  op: z.literal('writeFile'),
  path: z.string(),
  base64: z.string(),
});

export const computerRequestSchema = z.discriminatedUnion('op', [
  openSchema,
  navigateSchema,
  reloadSchema,
  readSchema,
  screenshotSchema,
  scrollSchema,
  desktopShotSchema,
  screenScrollSchema,
  screenBindSchema,
  screenActRequestSchema,
  takeoverBeginSchema,
  takeoverEndSchema,
  actRequestSchema,
  closeSchema,
  downloadSchema,
  runSchema,
  readFileSchema,
  writeFileSchema,
]);

export type ComputerRequest = z.infer<typeof computerRequestSchema>;

export type ComputerAct = z.infer<typeof actSchema>;

export type ScreenBinding = z.infer<typeof screenBindingSchema>;

export type ScreenAct = z.infer<typeof screenActSchema>;
