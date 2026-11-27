import type { ToolDefinition } from '@heynixie/tools';
import { z } from 'zod';
import { browserPageFields } from './browser-page-fields';
import { buildIdleNote } from './build-idle-note';
import type { ComputerState } from './computer-state';
import type { ComputerToolOptions } from './computer-tool-options';
import { buildChallengeField } from './handover/build-challenge-field';
import { hostOf } from './host-of';
import { prepareTabRead } from './prepare-tab-read';
import { readWebAddress } from './read-web-address';
import { refuseBlockedCapture } from './refuse-blocked-capture';
import { refuseTabGone } from './refuse-tab-gone';
import { refuseWrongReply } from './refuse-wrong-reply';
import { runComputerCall } from './run-computer-call';
import { showPicture } from './show-picture';
import { writeComputerPage } from './write-computer-page';

// The browser tools that run directly: open, read, screenshot, scroll, close and download.
export function buildBrowserReadTools(
  options: ComputerToolOptions,
  state: ComputerState,
): readonly ToolDefinition[] {
  return [
    buildOpenTool(options),
    buildReadTool(options),
    buildScreenshotTool(options),
    buildScrollTool(options),
    buildCloseTool(options),
    buildDownloadTool(options, state),
  ];
}

const diskNote = [
  'The browser keeps its profile on a disk of its own, so a sign-in survives a restart. The disk ',
  'is working space, not a store: isDiskNew is true when the disk is empty, so you know what ',
  'it held before is gone.',
].join('');

const openArguments = z.object({ url: z.string().min(1) });
const openTimeoutMs = 60_000;

function buildOpenTool(options: ComputerToolOptions): ToolDefinition {
  return {
    name: 'computer.browser_open',
    description: [
      'Opens a web page in your own browser, in a new tab, and returns its text. The browser ',
      'runs scripts and keeps its sign-ins, so use it for a page web_fetch cannot read. A tab ',
      'stays open until you close it; at most 5 tabs. Reach for the ',
      'computer when the result must still be there tomorrow, or when a site needs you signed in. ',
      'The page tools stay your main way in, because page text costs far fewer tokens than a ',
      'screenshot; computer.screenshot and the computer.screen_* tools are for what they cannot ',
      'reach. ',
      diskNote,
      browserPageFields.pageNote,
      browserPageFields.blockedNote,
      buildIdleNote(options.computer.idleMs),
    ].join(''),
    input: {
      type: 'object',
      properties: {
        url: { type: 'string', minLength: 1, description: 'the page to open' },
      },
      required: ['url'],
      additionalProperties: false,
    },
    output: browserPageFields.pageOutput,
    declaration: {
      effects: ['fetch'],
      destinations: [],
      amount: null,
      content: [],
      results: browserPageFields.pageResults,
    },
    execution: 'direct',
    prepare: (input) => {
      const target = readWebAddress(openArguments.parse(input).url);
      const prepared = typeof target === 'string' ? { destinations: [hostOf(target)] } : target;

      return Promise.resolve(prepared);
    },
    run: async (call, context) => {
      const target = readWebAddress(openArguments.parse(call.input).url);

      if (typeof target !== 'string') {
        return { status: 'ok', ...target };
      }

      const outcome = await runComputerCall(options, {
        run: context.run,
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
        return {
          status: 'ok',
          ...(outcome.kind === 'refused' ? outcome.result : refuseWrongReply()),
        };
      }

      const tab = options.computer.tabs.add(outcome.reply.tab);

      return {
        status: 'ok',
        ...(await writeComputerPage(options, context.run, tab, outcome.reply)),
      };
    },
  };
}

const readArguments = z.object({ tab: z.string().min(1), mode: z.enum(['text', 'snapshot']) });
const readTimeoutMs = 30_000;

function buildReadTool(options: ComputerToolOptions): ToolDefinition {
  return {
    name: 'computer.browser_read',
    description: [
      'Reads an open tab again. mode text gives the readable text; mode snapshot also marks each ',
      'control, such as [E4 textbox "Name"], so you can fill or click it.',
      browserPageFields.pageNote,
      buildIdleNote(options.computer.idleMs),
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
    output: browserPageFields.pageOutput,
    declaration: {
      effects: ['fetch'],
      destinations: [],
      amount: null,
      content: [],
      results: browserPageFields.pageResults,
    },
    execution: 'direct',
    prepare: (input, context) => prepareTabRead(options, context, readArguments.parse(input).tab),
    run: async (call, context) => {
      const input = readArguments.parse(call.input);
      const guestTab = options.computer.tabs.find(input.tab);

      if (guestTab === null) {
        return { status: 'ok', ...refuseTabGone(options, input.tab) };
      }

      const outcome = await runComputerCall(options, {
        run: context.run,
        namedURL: null,
        timeoutMs: readTimeoutMs,
        request: { op: 'read', tab: guestTab, mode: input.mode },
      });

      if (outcome.kind === 'refused' || outcome.reply.kind !== 'page') {
        return {
          status: 'ok',
          ...(outcome.kind === 'refused' ? outcome.result : refuseWrongReply()),
        };
      }

      const blocked = await refuseBlockedCapture(
        options,
        context.callSequence,
        outcome.reply.page.url,
      );

      if (blocked !== null) {
        return { status: 'ok', ...blocked };
      }

      return {
        status: 'ok',
        ...(await writeComputerPage(options, context.run, input.tab, outcome.reply)),
      };
    },
  };
}

const screenshotArguments = z.object({
  tab: z.string().min(1),
  control: z.string().min(1).optional(),
});

const pictureResults = {
  tab: 'owner_data',
  url: 'untrusted',
  width: 'untrusted',
  height: 'untrusted',
  isShown: 'owner_data',
  challenge: 'owner_data',
  refused: 'untrusted',
} as const;

function buildScreenshotTool(options: ComputerToolOptions): ToolDefinition {
  return {
    name: 'computer.browser_screenshot',
    description: [
      'Shows a picture of an open tab beside the result. With control, such as E4, the picture ',
      'is that control’s box, cut to the viewport, and it never scrolls the page; without it, the ',
      'viewport. A control that has moved or lies outside the viewport is refused with ',
      'STALE_ELEMENT, so scroll to it or read the page again.',
      buildIdleNote(options.computer.idleMs),
    ].join(''),
    input: {
      type: 'object',
      properties: {
        tab: { type: 'string', minLength: 1 },
        control: { type: 'string', minLength: 1, description: 'the control, such as E4' },
      },
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
        challenge: { type: 'string' },
        refused: { type: 'object' },
      },
      additionalProperties: false,
    },
    declaration: {
      effects: ['fetch'],
      destinations: [],
      amount: null,
      content: [],
      results: pictureResults,
    },
    execution: 'direct',
    prepare: (input, context) =>
      prepareTabRead(options, context, screenshotArguments.parse(input).tab),
    run: async (call, context) => {
      const input = screenshotArguments.parse(call.input);
      const guestTab = options.computer.tabs.find(input.tab);

      if (guestTab === null) {
        return { status: 'ok', ...refuseTabGone(options, input.tab) };
      }

      const outcome = await runComputerCall(options, {
        run: context.run,
        namedURL: null,
        timeoutMs: readTimeoutMs,
        request: {
          op: 'screenshot',
          tab: guestTab,
          ...(input.control === undefined ? {} : { control: input.control }),
        },
      });

      if (outcome.kind === 'refused' || outcome.reply.kind !== 'screenshot') {
        return {
          status: 'ok',
          ...(outcome.kind === 'refused' ? outcome.result : refuseWrongReply()),
        };
      }

      const blocked = await refuseBlockedCapture(options, context.callSequence, outcome.reply.url);

      if (blocked !== null) {
        return { status: 'ok', ...blocked };
      }

      return showPicture(options, context.run, {
        base64: outcome.reply.base64,
        result: {
          tab: input.tab,
          url: outcome.reply.url,
          width: outcome.reply.width,
          height: outcome.reply.height,
          ...buildChallengeField(outcome.reply.hasChallenge),
        },
      });
    },
  };
}

const scrollArguments = z.object({ tab: z.string().min(1), to: z.string().min(1) });

function buildScrollTool(options: ComputerToolOptions): ToolDefinition {
  return {
    name: 'computer.browser_scroll',
    description: [
      'Scrolls an open tab and shows the viewport’s picture beside the result. to is up or down, ',
      'a screen at a time, or a control such as E4, which scrolls into view. isAtEnd is true ',
      'when the page cannot scroll further that way: for up the top, otherwise the bottom. It ',
      'stores no page text. A control that has moved is refused with STALE_ELEMENT.',
      buildIdleNote(options.computer.idleMs),
    ].join(''),
    input: {
      type: 'object',
      properties: {
        tab: { type: 'string', minLength: 1 },
        to: { type: 'string', minLength: 1, description: 'up, down, or a control such as E4' },
      },
      required: ['tab', 'to'],
      additionalProperties: false,
    },
    output: {
      type: 'object',
      properties: {
        tab: { type: 'string' },
        isAtEnd: { type: 'boolean' },
        isShown: { type: 'boolean' },
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
        tab: 'owner_data',
        isAtEnd: 'untrusted',
        isShown: 'owner_data',
        refused: 'untrusted',
      },
    },
    execution: 'direct',
    prepare: (input, context) => prepareTabRead(options, context, scrollArguments.parse(input).tab),
    run: async (call, context) => {
      const input = scrollArguments.parse(call.input);
      const guestTab = options.computer.tabs.find(input.tab);

      if (guestTab === null) {
        return { status: 'ok', ...refuseTabGone(options, input.tab) };
      }

      const outcome = await runComputerCall(options, {
        run: context.run,
        namedURL: null,
        timeoutMs: readTimeoutMs,
        request: { op: 'scroll', tab: guestTab, to: input.to },
      });

      if (outcome.kind === 'refused' || outcome.reply.kind !== 'scroll') {
        return {
          status: 'ok',
          ...(outcome.kind === 'refused' ? outcome.result : refuseWrongReply()),
        };
      }

      const blocked = await refuseBlockedCapture(options, context.callSequence, outcome.reply.url);

      if (blocked !== null) {
        return { status: 'ok', ...blocked };
      }

      return showPicture(options, context.run, {
        base64: outcome.reply.base64,
        result: { tab: input.tab, isAtEnd: outcome.reply.isAtEnd },
      });
    },
  };
}

const tabArguments = z.object({ tab: z.string().min(1) });

function buildCloseTool(options: ComputerToolOptions): ToolDefinition {
  return {
    name: 'computer.browser_close',
    description: ['Closes an open tab.', buildIdleNote(options.computer.idleMs)].join(''),
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
        return { status: 'ok', ...refuseTabGone(options, input.tab) };
      }

      const outcome = await runComputerCall(options, {
        run: context.run,
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
    name: 'computer.browser_download',
    description: [
      'Clicks a download link or button of an open tab and saves the file to the shell’s disk ',
      'under downloads/. A file past 25 MiB is refused. Read it with computer.read_file or run ',
      'a command on it.',
      buildIdleNote(options.computer.idleMs),
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
        return { status: 'ok', ...refuseTabGone(options, input.tab) };
      }

      const outcome = await runComputerCall(options, {
        run: context.run,
        namedURL: null,
        timeoutMs: 60_000,
        request: { op: 'download', tab: guestTab, element: input.element },
      });

      if (outcome.kind === 'refused' || outcome.reply.kind !== 'file') {
        return {
          status: 'ok',
          ...(outcome.kind === 'refused' ? outcome.result : refuseWrongReply()),
        };
      }

      const name = outcome.reply.name.replaceAll(/[^\w.-]/gu, '_');
      const path = `downloads/${name}`;

      const written = await runComputerCall(options, {
        run: context.run,
        namedURL: null,
        timeoutMs: readTimeoutMs,
        request: { op: 'writeFile', path, base64: outcome.reply.base64 },
      });

      state.files.count += 1;

      if (written.kind === 'refused' || written.reply.kind !== 'written') {
        return {
          status: 'ok',
          ...(written.kind === 'refused' ? written.result : refuseWrongReply()),
        };
      }

      return {
        status: 'ok',
        result: { path, bytes: written.reply.bytes, isDiskNew: written.reply.isDiskNew },
      };
    },
  };
}
