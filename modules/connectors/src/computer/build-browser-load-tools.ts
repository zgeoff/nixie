import type { ToolDefinition } from '@heynixie/tools';
import { z } from 'zod';
import { browserPageFields } from './browser-page-fields';
import { buildIdleNote } from './build-idle-note';
import type { ComputerToolOptions } from './computer-tool-options';
import { hostOf } from './host-of';
import { readWebAddress } from './read-web-address';
import { refuseTabGone } from './refuse-tab-gone';
import { refuseWrongReply } from './refuse-wrong-reply';
import { runComputerCall } from './run-computer-call';
import { writeComputerPage } from './write-computer-page';

// The browser tools that load an address in a tab that is already open: navigate and reload.
export function buildBrowserLoadTools(options: ComputerToolOptions): readonly ToolDefinition[] {
  return [buildNavigateTool(options), buildReloadTool(options)];
}

const loadTimeoutMs = 60_000;
const navigateArguments = z.object({ tab: z.string().min(1), url: z.string().min(1) });

function buildNavigateTool(options: ComputerToolOptions): ToolDefinition {
  return {
    name: 'computer.browser_navigate',
    description: [
      'Loads a new address in a tab that is already open, and returns the new page’s text. The ',
      'tab keeps its name, its sign-ins and its place among the 5 tabs. The new address goes ',
      'through the owner’s rules for its site, as computer.browser_open does.',
      browserPageFields.pageNote,
      browserPageFields.blockedNote,
      buildIdleNote(options.computer.idleMs),
    ].join(''),
    input: {
      type: 'object',
      properties: {
        tab: { type: 'string', minLength: 1 },
        url: { type: 'string', minLength: 1, description: 'the address to load' },
      },
      required: ['tab', 'url'],
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
      const target = readWebAddress(navigateArguments.parse(input).url);
      const prepared = typeof target === 'string' ? { destinations: [hostOf(target)] } : target;

      return Promise.resolve(prepared);
    },
    run: async (call, context) => {
      const input = navigateArguments.parse(call.input);
      const target = readWebAddress(input.url);

      if (typeof target !== 'string') {
        return { status: 'ok', ...target };
      }

      const guestTab = options.computer.tabs.find(input.tab);

      if (guestTab === null) {
        return { status: 'ok', ...refuseTabGone(options, input.tab) };
      }

      const outcome = await runComputerCall(options, {
        run: context.run,
        namedURL: target,
        timeoutMs: loadTimeoutMs,
        request: {
          op: 'navigate',
          tab: guestTab,
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

      return {
        status: 'ok',
        ...(await writeComputerPage(options, context.run, input.tab, outcome.reply)),
      };
    },
  };
}

const reloadArguments = z.object({ tab: z.string().min(1) });

function buildReloadTool(options: ComputerToolOptions): ToolDefinition {
  return {
    name: 'computer.browser_reload',
    description: [
      'Reloads an open tab and returns its page’s text. It loads the address the tab already ',
      'shows, so it never asks the owner.',
      browserPageFields.pageNote,
      browserPageFields.blockedNote,
      buildIdleNote(options.computer.idleMs),
    ].join(''),
    input: {
      type: 'object',
      properties: { tab: { type: 'string', minLength: 1 } },
      required: ['tab'],
      additionalProperties: false,
    },
    output: browserPageFields.pageOutput,
    declaration: {
      effects: ['note'],
      destinations: [],
      amount: null,
      content: [],
      results: browserPageFields.pageResults,
    },
    execution: 'direct',
    run: async (call, context) => {
      const input = reloadArguments.parse(call.input);
      const guestTab = options.computer.tabs.find(input.tab);

      if (guestTab === null) {
        return { status: 'ok', ...refuseTabGone(options, input.tab) };
      }

      const outcome = await runComputerCall(options, {
        run: context.run,
        namedURL: null,
        timeoutMs: loadTimeoutMs,
        request: { op: 'reload', tab: guestTab, limits: options.fetch.limits },
      });

      if (outcome.kind === 'refused' || outcome.reply.kind !== 'page') {
        return {
          status: 'ok',
          ...(outcome.kind === 'refused' ? outcome.result : refuseWrongReply()),
        };
      }

      return {
        status: 'ok',
        ...(await writeComputerPage(options, context.run, input.tab, outcome.reply)),
      };
    },
  };
}
