import type { JSONObject } from '@heynixie/log';
import { actionProposalLapseMs } from '@heynixie/policy';
import type { DirectResult, Prepared, ToolDefinition, ToolResolveContext } from '@heynixie/tools';
import { z } from 'zod';
import { buildIdleNote } from './build-idle-note';
import type { ComputerState } from './computer-state';
import { buildActionKey } from './computer-state';
import type { ComputerToolOptions } from './computer-tool-options';
import { findURLHost } from './find-url-host';
import type { ClickReach } from './pick-click-reach';
import { pickClickReach } from './pick-click-reach';
import { refuseTabGone } from './refuse-tab-gone';
import type { ComputerOutcome } from './run-computer-call';
import {
  makeActionScans,
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
      name: 'computer.browser_fill',
      description: [
        'Types a value into one control of an open tab, and with submit true presses Enter in it ',
        'to submit its form. A form that posts to another site is never submitted.',
        queuedNote,
        buildIdleNote(options.computer.idleMs),
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
        requiresDestination: true,
        amount: null,
        content: ['value'],
        results: actResults,
      },
      execution: 'queued',
      prepare: (input, context) =>
        prepareAct(options, state, { tool: 'computer.browser_fill', input, context }),
      run: () =>
        Promise.resolve({ status: 'error', message: 'computer.browser_fill runs only queued' }),
    },
    {
      name: 'computer.browser_click',
      description: [
        'Clicks one control of an open tab, such as a link, a button or a checkbox.',
        queuedNote,
        buildIdleNote(options.computer.idleMs),
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
        effects: ['fetch'],
        destinations: [],
        requiresDestination: true,
        amount: null,
        content: [],
        results: actResults,
      },
      execution: 'queued',
      prepare: (input, context) =>
        prepareAct(options, state, { tool: 'computer.browser_click', input, context }),
      run: () =>
        Promise.resolve({ status: 'error', message: 'computer.browser_click runs only queued' }),
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
const clickArguments = z.object({ tab: z.string().min(1), element: z.string().min(1) });

async function prepareAct(
  options: ComputerToolOptions,
  state: ComputerState,
  preparation: ActPreparation,
): Promise<DirectResult | Prepared> {
  const tab = z.object({ tab: z.string() }).parse(preparation.input).tab;
  const guestTab = options.computer.tabs.find(tab);

  if (guestTab === null) {
    return refuseTabGone(options, tab);
  }

  const outcome = await runComputerCall(options, {
    run: preparation.context.run,
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
  const host = findURLHost(url);

  if (preparation.tool !== 'computer.browser_click') {
    state.expectations.set(key, url);
    state.holds.get(key)?.();
    state.holds.set(key, options.computer.hold(actionProposalLapseMs));

    return { destinations: host === null ? [] : [host], expectURL: url };
  }

  const element = clickArguments.parse(preparation.input).element;

  const elementOutcome = await runComputerCall(options, {
    run: preparation.context.run,
    namedURL: null,
    timeoutMs: prepareTimeoutMs,
    request: { op: 'element', tab: guestTab, element },
  });

  const reach = pickClickOutcome(elementOutcome, url);

  if (!('destinations' in reach)) {
    return reach;
  }

  state.expectations.set(key, url);
  state.clicks.set(key, reach.isPlainLink);
  state.holds.get(key)?.();
  state.holds.set(key, options.computer.hold(actionProposalLapseMs));

  return {
    destinations: [...reach.destinations],

    // a plain link only loads a page; any other control acts on the tab's page
    ...(reach.isPlainLink ? {} : { effects: ['send' as const] }),
    expectURL: url,
  };
}

// The reach of a click from the guest's answer about the control, or the refusal that ends the call.
function pickClickOutcome(outcome: ComputerOutcome, tabURL: string): ClickReach | DirectResult {
  if (outcome.kind === 'refused') {
    return outcome.result;
  }

  return outcome.reply.kind === 'element'
    ? pickClickReach(outcome.reply.element, tabURL)
    : refuseComputer('COMPUTER_FAILED', 'the browser answered with the wrong kind of reply');
}

const fillArguments = z.object({
  tab: z.string().min(1),
  element: z.string().min(1),
  value: z.string(),
  submit: z.boolean().optional(),
});

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

  if (guestTab === null) {
    return refuseTabGone(options, tab);
  }

  if (expectURL === undefined) {
    return refuseComputer(
      'PAGE_CHANGED',
      'nixie restarted since the call was prepared, so it cannot tell the page is the same',
    );
  }

  const changed =
    attempt.tool === 'computer.browser_click'
      ? await refuseChangedClick(options, state, { attempt, guestTab, expectURL, key })
      : null;

  if (changed !== null) {
    state.expectations.delete(key);
    state.clicks.delete(key);

    return changed;
  }

  const acts =
    attempt.tool === 'computer.browser_fill'
      ? fillActs(fillArguments.parse(attempt.arguments))
      : clickActs(clickArguments.parse(attempt.arguments));

  const outcome = await options.computer.call({
    timeoutMs: 60_000,
    ...makeActionScans(options),
    request: { op: 'act', tab: guestTab, expectURL, ...acts },
  });

  state.expectations.delete(key);
  state.clicks.delete(key);

  const sorted = sortCallResult(outcome);

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

interface ClickRecheck {
  readonly attempt: ComputerAttempt;
  readonly guestTab: string;
  readonly expectURL: string;
  readonly key: string;
}

// A click runs only when its control still reaches what the owner allowed: a link that became a
// button, or one that now points to another host, is a new question.
async function refuseChangedClick(
  options: ComputerToolOptions,
  state: ComputerState,
  recheck: ClickRecheck,
): Promise<DirectResult | null> {
  const element = clickArguments.parse(recheck.attempt.arguments).element;

  const reply = await options.computer.call({
    timeoutMs: prepareTimeoutMs,
    ...makeActionScans(options),
    request: { op: 'element', tab: recheck.guestTab, element },
  });

  const reach = pickClickOutcome(sortCallResult(reply), recheck.expectURL);

  if (!('destinations' in reach)) {
    return reach;
  }

  const isSame =
    reach.isPlainLink === state.clicks.get(recheck.key) &&
    reach.destinations.length === recheck.attempt.destinations.length &&
    reach.destinations.every((host, index) => host === recheck.attempt.destinations[index]);

  return isSame
    ? null
    : refuseComputer(
        'PAGE_CHANGED',
        'the control this call was prepared for reaches somewhere else now, so it was not clicked',
      );
}
