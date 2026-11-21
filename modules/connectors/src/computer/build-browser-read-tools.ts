import type { DirectResult, ToolDefinition, ToolRun } from '@heynixie/tools';
import { z } from 'zod';
import { fitFetchedImage } from '../fetch/fit-fetched-image';
import { getPageSession } from '../utils/get-page-session';
import { readLinkTarget } from '../web/read-link-target';
import type { ComputerState } from './computer-state';
import type { ComputerToolOptions } from './computer-tool-options';
import { refuseComputer, runComputerCall } from './run-computer-call';
import { writeComputerPage } from './write-computer-page';

// The tools that only read: open, read, screenshot and close.
export function buildBrowserReadTools(
  options: ComputerToolOptions,
  state: ComputerState,
): readonly ToolDefinition[] {
  return [
    buildOpenTool(options),
    buildReadTool(options),
    buildScreenshotTool(options),
    buildCloseTool(options),
    buildDownloadTool(options, state),
  ];
}

const diskNote = [
  'The browser keeps its profile on a disk of its own, so a sign-in survives a restart. The disk ',
  'is working space, not a store: isDiskNew is true when the disk is empty, so you know what ',
  'it held before is gone.',
].join('');

const pageNote = [
  ' The page text comes back as parts like web_fetch: pass the page ID to web_fetch with a part ',
  'to read another. Text marked [E4 textbox "Name"] is a control: pass E4 as element to ',
  'computer.fill or computer.click.',
].join('');

const pageOutput = {
  type: 'object',
  properties: {
    tab: { type: 'string' },
    url: { type: 'string' },
    status: { type: 'number' },
    title: { type: 'string' },
    page: { type: 'string' },
    part: { type: 'number' },
    parts: { type: 'number' },
    text: { type: 'string' },
    isDiskNew: { type: 'boolean' },
    refused: { type: 'object' },
  },
  additionalProperties: false,
};

const pageResults = {
  tab: 'owner_data',
  url: 'untrusted',
  status: 'untrusted',
  title: 'untrusted',
  page: 'untrusted',
  part: 'untrusted',
  parts: 'untrusted',
  text: 'untrusted',
  isDiskNew: 'owner_data',
  refused: 'untrusted',
} as const;

const openArguments = z.object({ url: z.string().min(1).optional(), link: z.number().optional() });
const openTimeoutMs = 60_000;

function buildOpenTool(options: ComputerToolOptions): ToolDefinition {
  return {
    name: 'computer.open',
    description: [
      'Opens a web page in your own browser, in a new tab, and returns its text. The browser ',
      'runs scripts and keeps its sign-ins, so use it for a page web_fetch cannot read. A tab ',
      'stays open until you close it or the browser sleeps; at most 5 tabs. ',
      diskNote,
      pageNote,
    ].join(''),
    input: {
      type: 'object',
      properties: {
        url: { type: 'string', minLength: 1, description: 'the page to open' },
        link: { type: 'number', description: 'the number of a link from a web_fetch page' },
      },
      additionalProperties: false,
    },
    output: pageOutput,
    declaration: {
      effects: ['fetch'],
      destinations: [],
      amount: null,
      content: [],
      results: pageResults,
    },
    execution: 'direct',
    prepare: async (input, context) => {
      const target = await readOpenTarget(options, context.run, openArguments.parse(input));

      return typeof target === 'string' ? { destinations: [hostOf(target)] } : target;
    },
    run: async (call, context) => {
      const target = await readOpenTarget(options, context.run, openArguments.parse(call.input));

      if (typeof target !== 'string') {
        return { status: 'ok', ...target };
      }

      const outcome = await runComputerCall(options, {
        run: context.run,
        kind: 'browser',
        namedURL: target,
        timeoutMs: openTimeoutMs,
        request: {
          op: 'open',
          url: target,
          limits: options.fetch.limits,
          deniedRanges: [...options.deniedRanges],
        },
      });

      if (outcome.kind === 'refused' || outcome.reply.kind !== 'page') {
        return { status: 'ok', ...(outcome.kind === 'refused' ? outcome.result : unexpected()) };
      }

      const tab = options.computer.tabs.add(outcome.reply.tab);

      return {
        status: 'ok',
        ...(await writeComputerPage(options, context.run, tab, outcome.reply)),
      };
    },
  };
}

async function readOpenTarget(
  options: ComputerToolOptions,
  run: ToolRun,
  input: z.infer<typeof openArguments>,
): Promise<string | DirectResult> {
  const named =
    input.url ??
    (input.link === undefined
      ? null
      : await readLinkTarget(options.log, {
          sessionKey: getPageSession(run).sessionKey,
          number: input.link,
        }));

  if (named === null) {
    return refuseComputer(
      'NO_URL',
      'name a url, or the number of a link from a page of this session',
    );
  }

  return URL.canParse(named) && /^https?:$/u.test(new URL(named).protocol)
    ? named
    : refuseComputer('BAD_URL', 'the browser opens only http and https addresses');
}

function hostOf(url: string): string {
  return URL.canParse(url) ? new URL(url).host : url;
}

function unexpected(): DirectResult {
  return refuseComputer('COMPUTER_FAILED', 'the browser answered with the wrong kind of reply');
}

const readArguments = z.object({ tab: z.string().min(1), mode: z.enum(['text', 'snapshot']) });
const readTimeoutMs = 30_000;

function buildReadTool(options: ComputerToolOptions): ToolDefinition {
  return {
    name: 'computer.read',
    description: [
      'Reads an open tab again. mode text gives the readable text; mode snapshot also marks each ',
      'control, such as [E4 textbox "Name"], so you can fill or click it.',
      pageNote,
    ].join(''),
    input: {
      type: 'object',
      properties: {
        tab: { type: 'string', minLength: 1 },
        mode: { type: 'string', enum: ['text', 'snapshot'] },
      },
      required: ['tab', 'mode'],
      additionalProperties: false,
    },
    output: pageOutput,
    declaration: {
      effects: ['note'],
      destinations: [],
      amount: null,
      content: [],
      results: pageResults,
    },
    execution: 'direct',
    run: async (call, context) => {
      const input = readArguments.parse(call.input);
      const guestTab = options.computer.tabs.find(input.tab);

      if (guestTab === null) {
        return { status: 'ok', ...tabGone(input.tab) };
      }

      const outcome = await runComputerCall(options, {
        run: context.run,
        kind: 'browser',
        namedURL: null,
        timeoutMs: readTimeoutMs,
        request: { op: 'read', tab: guestTab, mode: input.mode },
      });

      if (outcome.kind === 'refused' || outcome.reply.kind !== 'page') {
        return { status: 'ok', ...(outcome.kind === 'refused' ? outcome.result : unexpected()) };
      }

      return {
        status: 'ok',
        ...(await writeComputerPage(options, context.run, input.tab, outcome.reply)),
      };
    },
  };
}

function tabGone(tab: string): DirectResult {
  return refuseComputer(
    'TAB_GONE',
    `there is no tab ${tab}; the browser may have slept or restarted, so open the page again`,
  );
}

const tabArguments = z.object({ tab: z.string().min(1) });

function buildScreenshotTool(options: ComputerToolOptions): ToolDefinition {
  return {
    name: 'computer.screenshot',
    description: 'Shows a picture of an open tab beside the result.',
    input: {
      type: 'object',
      properties: { tab: { type: 'string', minLength: 1 } },
      required: ['tab'],
      additionalProperties: false,
    },
    output: {
      type: 'object',
      properties: {
        tab: { type: 'string' },
        url: { type: 'string' },
        width: { type: 'number' },
        height: { type: 'number' },
        isShown: { type: 'boolean' },
        refused: { type: 'object' },
      },
      additionalProperties: false,
    },
    declaration: {
      effects: ['note'],
      destinations: [],
      amount: null,
      content: [],
      results: {
        tab: 'owner_data',
        url: 'untrusted',
        width: 'untrusted',
        height: 'untrusted',
        isShown: 'owner_data',
        refused: 'untrusted',
      },
    },
    execution: 'direct',
    run: async (call, context) => {
      const input = tabArguments.parse(call.input);
      const guestTab = options.computer.tabs.find(input.tab);

      if (guestTab === null) {
        return { status: 'ok', ...tabGone(input.tab) };
      }

      const outcome = await runComputerCall(options, {
        run: context.run,
        kind: 'browser',
        namedURL: null,
        timeoutMs: readTimeoutMs,
        request: { op: 'screenshot', tab: guestTab },
      });

      if (outcome.kind === 'refused' || outcome.reply.kind !== 'screenshot') {
        return { status: 'ok', ...(outcome.kind === 'refused' ? outcome.result : unexpected()) };
      }

      const fitted = await fitFetchedImage(
        Buffer.from(outcome.reply.base64, 'base64'),
        options.fetch.imageLongEdge,
      );

      const reserved =
        fitted.kind === 'image' && (context.run.session?.reserveImages?.([fitted.image]) ?? true);

      return {
        status: 'ok',
        result: {
          tab: input.tab,
          url: outcome.reply.url,
          width: outcome.reply.width,
          height: outcome.reply.height,
          isShown: reserved,
        },
        images: reserved && fitted.kind === 'image' ? [fitted.image] : [],
      };
    },
  };
}

function buildCloseTool(options: ComputerToolOptions): ToolDefinition {
  return {
    name: 'computer.close',
    description: 'Closes an open tab.',
    input: {
      type: 'object',
      properties: { tab: { type: 'string', minLength: 1 } },
      required: ['tab'],
      additionalProperties: false,
    },
    output: {
      type: 'object',
      properties: { closed: { type: 'string' }, refused: { type: 'object' } },
      additionalProperties: false,
    },
    declaration: {
      effects: ['note'],
      destinations: [],
      amount: null,
      content: [],
      results: { closed: 'owner_data', refused: 'untrusted' },
    },
    execution: 'direct',
    run: async (call, context) => {
      const input = tabArguments.parse(call.input);
      const guestTab = options.computer.tabs.find(input.tab);

      if (guestTab === null) {
        return { status: 'ok', ...tabGone(input.tab) };
      }

      const outcome = await runComputerCall(options, {
        run: context.run,
        kind: 'browser',
        namedURL: null,
        timeoutMs: readTimeoutMs,
        request: { op: 'close', tab: guestTab },
      });

      options.computer.tabs.remove(input.tab);

      return {
        status: 'ok',
        ...(outcome.kind === 'refused' ? outcome.result : { result: { closed: input.tab } }),
      };
    },
  };
}

const elementArguments = z.object({ tab: z.string().min(1), element: z.string().min(1) });

function buildDownloadTool(options: ComputerToolOptions, state: ComputerState): ToolDefinition {
  return {
    name: 'computer.download',
    description: [
      'Clicks a download link or button of an open tab and saves the file to the shell’s disk ',
      'under downloads/. A file past 25 MiB is refused. Read it with computer.read_file or run ',
      'a command on it.',
    ].join(''),
    input: {
      type: 'object',
      properties: {
        tab: { type: 'string', minLength: 1 },
        element: { type: 'string', minLength: 1 },
      },
      required: ['tab', 'element'],
      additionalProperties: false,
    },
    output: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        bytes: { type: 'number' },
        isDiskNew: { type: 'boolean' },
        refused: { type: 'object' },
      },
      additionalProperties: false,
    },
    declaration: {
      effects: ['fetch'],
      destinations: [],
      amount: null,
      content: [],
      results: {
        path: 'untrusted',
        bytes: 'owner_data',
        isDiskNew: 'owner_data',
        refused: 'untrusted',
      },
    },
    execution: 'direct',
    run: async (call, context) => {
      const input = elementArguments.parse(call.input);
      const guestTab = options.computer.tabs.find(input.tab);

      if (guestTab === null) {
        return { status: 'ok', ...tabGone(input.tab) };
      }

      const outcome = await runComputerCall(options, {
        run: context.run,
        kind: 'browser',
        namedURL: null,
        timeoutMs: 60_000,
        request: { op: 'download', tab: guestTab, element: input.element },
      });

      if (outcome.kind === 'refused' || outcome.reply.kind !== 'file') {
        return { status: 'ok', ...(outcome.kind === 'refused' ? outcome.result : unexpected()) };
      }

      const name = outcome.reply.name.replaceAll(/[^\w.-]/gu, '_');
      const path = `downloads/${name}`;

      const written = await runComputerCall(options, {
        run: context.run,
        kind: 'shell',
        namedURL: null,
        timeoutMs: readTimeoutMs,
        request: { op: 'writeFile', path, base64: outcome.reply.base64 },
      });

      state.files.count += 1;

      if (written.kind === 'refused' || written.reply.kind !== 'written') {
        return { status: 'ok', ...(written.kind === 'refused' ? written.result : unexpected()) };
      }

      return {
        status: 'ok',
        result: { path, bytes: written.reply.bytes, isDiskNew: written.reply.isDiskNew },
      };
    },
  };
}
