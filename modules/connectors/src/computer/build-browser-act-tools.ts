import type { JSONObject } from '@heynixie/log';
import { actionProposalLapseMs } from '@heynixie/policy';
import type { DirectResult, ToolDefinition, ToolResolveContext } from '@heynixie/tools';
import { z } from 'zod';
import type { ComputerState } from './computer-state';
import { buildActionKey } from './computer-state';
import type { ComputerToolOptions } from './computer-tool-options';
import {
  makeActionScan,
  refuseComputer,
  runComputerCall,
  sortCallResult,
} from './run-computer-call';
import type { ComputerAttempt } from './types';

const queuedNote = [
  ' The call waits for the owner to allow it, per site, and then runs against the page it was ',
  'asked about: if the tab has moved to another URL by then, it is refused with PAGE_CHANGED.',
].join('');

const actOutput = {
  type: 'object',
  properties: {
    tab: { type: 'string' },
    url: { type: 'string' },
    status: { type: 'number' },
    title: { type: 'string' },
    text: { type: 'string' },
    isDiskNew: { type: 'boolean' },
    refused: { type: 'object' },
  },
  additionalProperties: false,
};

const actResults = {
  tab: 'owner_data',
  url: 'untrusted',
  status: 'untrusted',
  title: 'untrusted',
  text: 'untrusted',
  isDiskNew: 'owner_data',
  refused: 'untrusted',
} as const;

// The tools that change a page: fill and click. Each is queued, and its destination is the host
// the tab shows when the call is prepared.
export function buildBrowserActTools(
  options: ComputerToolOptions,
  state: ComputerState,
): readonly ToolDefinition[] {
  return [
    {
      name: 'computer.fill',
      description: [
        'Types a value into one control of an open tab, and with submit true presses Enter in it ',
        'to submit its form. A form that posts to another site is never submitted.',
        queuedNote,
      ].join(''),
      input: {
        type: 'object',
        properties: {
          tab: { type: 'string', minLength: 1 },
          element: { type: 'string', minLength: 1, description: 'the control, such as E4' },
          value: { type: 'string' },
          submit: { type: 'boolean' },
        },
        required: ['tab', 'element', 'value'],
        additionalProperties: false,
      },
      output: actOutput,
      declaration: {
        effects: ['send'],
        destinations: [],
        amount: null,
        content: ['value'],
        results: actResults,
      },
      execution: 'queued',
      prepare: (input, context) =>
        prepareAct(options, state, { tool: 'computer.fill', input, context }),
      run: () => Promise.resolve({ status: 'error', message: 'computer.fill runs only queued' }),
    },
    {
      name: 'computer.click',
      description: [
        'Clicks one control of an open tab, such as a link, a button or a checkbox.',
        queuedNote,
      ].join(''),
      input: {
        type: 'object',
        properties: {
          tab: { type: 'string', minLength: 1 },
          element: { type: 'string', minLength: 1, description: 'the control, such as E4' },
        },
        required: ['tab', 'element'],
        additionalProperties: false,
      },
      output: actOutput,
      declaration: {
        effects: ['send'],
        destinations: [],
        amount: null,
        content: [],
        results: actResults,
      },
      execution: 'queued',
      prepare: (input, context) =>
        prepareAct(options, state, { tool: 'computer.click', input, context }),
      run: () => Promise.resolve({ status: 'error', message: 'computer.click runs only queued' }),
    },
  ];
}

interface ActPreparation {
  readonly tool: string;
  readonly input: JSONObject;
  readonly context: ToolResolveContext;
}

const prepareTimeoutMs = 30_000;

// Reads the tab's URL, which becomes the destination and the URL the action expects, and keeps the
// browser awake until the action runs or its approval lapses.
async function prepareAct(
  options: ComputerToolOptions,
  state: ComputerState,
  preparation: ActPreparation,
): Promise<
  DirectResult | { readonly destinations: readonly string[]; readonly expectURL: string }
> {
  const tab = z.object({ tab: z.string() }).parse(preparation.input).tab;
  const guestTab = options.computer.tabs.find(tab);

  if (guestTab === null) {
    return refuseComputer('TAB_GONE', `there is no tab ${tab}; open the page again`);
  }

  const outcome = await runComputerCall(options, {
    run: preparation.context.run,
    kind: 'browser',
    namedURL: null,
    timeoutMs: prepareTimeoutMs,
    request: { op: 'read', tab: guestTab, mode: 'text' },
  });

  if (outcome.kind === 'refused') {
    return outcome.result;
  }

  if (outcome.reply.kind !== 'page') {
    return refuseComputer('COMPUTER_FAILED', 'the browser answered with the wrong kind of reply');
  }

  const url = outcome.reply.page.url;
  const key = buildActionKey(preparation.tool, preparation.input);

  state.expectations.set(key, url);
  state.holds.get(key)?.();
  state.holds.set(key, options.computer.hold('browser', actionProposalLapseMs));

  return { destinations: [new URL(url).host], expectURL: url };
}

const fillArguments = z.object({
  tab: z.string().min(1),
  element: z.string().min(1),
  value: z.string(),
  submit: z.boolean().optional(),
});

const clickArguments = z.object({ tab: z.string().min(1), element: z.string().min(1) });

// The attempt of a queued fill or click: the same call against the page it was prepared for.
export async function runBrowserAct(
  options: ComputerToolOptions,
  state: ComputerState,
  attempt: ComputerAttempt,
): Promise<DirectResult> {
  const key = buildActionKey(attempt.tool, attempt.arguments);
  const expectURL = state.expectations.get(key);

  state.holds.get(key)?.();
  state.holds.delete(key);

  const tab = z.object({ tab: z.string() }).parse(attempt.arguments).tab;
  const guestTab = options.computer.tabs.find(tab);

  if (expectURL === undefined) {
    return refuseComputer(
      'PAGE_CHANGED',
      'nixie restarted since the call was prepared, so it cannot tell the page is the same',
    );
  }

  if (guestTab === null) {
    return refuseComputer('TAB_GONE', `there is no tab ${tab}; open the page again`);
  }

  const acts =
    attempt.tool === 'computer.fill'
      ? fillActs(fillArguments.parse(attempt.arguments))
      : clickActs(clickArguments.parse(attempt.arguments));

  const outcome = await options.computer.call('browser', {
    timeoutMs: 60_000,
    scan: makeActionScan(options),
    request: { op: 'act', tab: guestTab, expectURL, ...acts },
  });

  state.expectations.delete(key);

  const sorted = sortCallResult(outcome, 'browser');

  if (sorted.kind === 'refused') {
    return sorted.result;
  }

  if (sorted.reply.kind !== 'page') {
    return refuseComputer('COMPUTER_FAILED', 'the browser did not answer the act with a page');
  }

  return {
    result: {
      tab,
      url: sorted.reply.page.url,
      status: sorted.reply.page.status,
      title: sorted.reply.page.title,
      text: sorted.reply.page.text,
      isDiskNew: sorted.reply.isDiskNew,
    },
  };
}

function fillActs(input: z.infer<typeof fillArguments>) {
  return {
    acts: [{ kind: 'fill' as const, element: input.element, value: input.value }],
    submit: input.submit ?? false,
  };
}

function clickActs(input: z.infer<typeof clickArguments>) {
  return { acts: [{ kind: 'click' as const, element: input.element }], submit: false };
}
