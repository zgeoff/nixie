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
  readSchema,
  screenshotSchema,
  scrollSchema,
  actRequestSchema,
  closeSchema,
  downloadSchema,
  runSchema,
  readFileSchema,
  writeFileSchema,
]);

export type ComputerRequest = z.infer<typeof computerRequestSchema>;

export type ComputerAct = z.infer<typeof actSchema>;
