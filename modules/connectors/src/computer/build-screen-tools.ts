import { createHash } from 'node:crypto';
import type { JSONObject } from '@heynixie/log';
import { actionProposalLapseMs, buildActionHash } from '@heynixie/policy';
import type { DirectResult, Prepared, ToolDefinition, ToolResolveContext } from '@heynixie/tools';
import type { ComputerFocus, ScreenAct, ScreenBinding } from '@heynixie/wire';
import { z } from 'zod';
import type { ComputerState, ScreenPrepared } from './computer-state';
import { buildActionKey } from './computer-state';
import type { ComputerToolOptions } from './computer-tool-options';
import { isSameList } from './is-same-list';
import { pickScreenDestinations } from './pick-screen-destinations';
import { prepareScreenRead } from './prepare-screen-read';
import {
  makeActionScans,
  refuseComputer,
  runComputerCall,
  sortCallResult,
} from './run-computer-call';
import { screenMessages } from './screen-messages';
import { fitPicture, showPicture } from './show-picture';
import type { ComputerAttempt } from './types';

// The tools that look at and drive the whole desktop: a screenshot and a scroll run directly, and a
// click and typing are queued. Each result says which window has focus, and whether the user is
// watching.
export function buildScreenTools(
  options: ComputerToolOptions,
  state: ComputerState,
): readonly ToolDefinition[] {
  return [
    buildScreenshotTool(options),
    buildScrollTool(options),
    buildClickTool(options, state),
    buildTypeTool(options, state),
  ];
}

const readTimeoutMs = 30_000;

const screenNote = [
  ' The page tools, computer.browser_read and computer.browser_click, stay your main way in: page ',
  'text costs far fewer tokens than a screenshot. Use the screen for what they cannot reach.',
].join('');

const focusSchema = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: ['browser', 'terminal', 'other'] },
    tab: { type: 'string' },
    url: { type: 'string' },
  },
  required: ['kind'],
  additionalProperties: false,
};

const pictureOutput = {
  type: 'object',
  properties: {
    width: { type: 'number' },
    height: { type: 'number' },
    focus: focusSchema,
    isWatched: { type: 'boolean' },
    isShown: { type: 'boolean' },
    refused: { type: 'object' },
  },
  additionalProperties: false,
};

const pictureResults = {
  width: 'untrusted',
  height: 'untrusted',
  focus: 'untrusted',
  isWatched: 'owner_data',
  isShown: 'owner_data',
  refused: 'untrusted',
} as const;

function buildScreenshotTool(options: ComputerToolOptions): ToolDefinition {
  return {
    name: 'computer.screenshot',
    description: [
      'Shows a picture of the whole desktop beside the result. The desktop is 1280 by 800, and a ',
      'screen click takes a point on it. The result gives the picture’s own width and height: if ',
      'it is smaller than 1280 wide, multiply a point on it by 1280 divided by its width. The ',
      'result names the window that has focus: a browser tab, the terminal or another window.',
      screenNote,
    ].join(''),
    input: { type: 'object', properties: {}, additionalProperties: false },
    output: { ...pictureOutput },
    declaration: {
      effects: ['fetch'],
      destinations: [],
      amount: null,
      content: [],
      results: pictureResults,
    },
    execution: 'direct',
    prepare: (_input, context) => prepareScreenRead(options, context),
    run: async (_call, context) => {
      const outcome = await runComputerCall(options, {
        run: context.run,
        namedURL: null,
        timeoutMs: readTimeoutMs,
        request: { op: 'desktopShot' },
      });

      if (outcome.kind === 'refused' || outcome.reply.kind !== 'desktop') {
        return { status: 'ok', ...(outcome.kind === 'refused' ? outcome.result : unexpected()) };
      }

      return showPicture(options, context.run, {
        isDesktop: true,
        base64: outcome.reply.base64,
        result: {
          width: outcome.reply.width,
          height: outcome.reply.height,
          focus: toFocusResult(options, outcome.reply.focus),
          isWatched: options.computer.isWatched(),
        },
      });
    },
  };
}

function unexpected(): DirectResult {
  return refuseComputer('COMPUTER_FAILED', 'the computer answered with the wrong kind of reply');
}

// The focus as the model reads it: a browser tab carries the model's own tab ID. A tab the model
// has not named yet, such as one a page opened, gets the next ID now.
function toFocusResult(options: ComputerToolOptions, focus: ComputerFocus): JSONObject {
  if (focus.kind !== 'browser') {
    return { kind: focus.kind };
  }

  const tab = options.computer.tabs.findGuest(focus.tab) ?? options.computer.tabs.add(focus.tab);

  return { kind: 'browser', tab, url: focus.url };
}

const scrollArguments = z.object({ x: z.number(), y: z.number(), by: z.number() });

function buildScrollTool(options: ComputerToolOptions): ToolDefinition {
  return {
    name: 'computer.screen_scroll',
    description: [
      'Turns the mouse wheel over a point of the screen, x 0 to 1279 and y 0 to 799, and shows ',
      'the desktop beside the result. by is a whole number of wheel steps, 1 to 50: positive ',
      'scrolls down and negative up. A point on the terminal is refused with USE_RUN.',
      screenNote,
    ].join(''),
    input: {
      type: 'object',
      properties: {
        x: { type: 'integer', description: 'the column, 0 to 1279' },
        y: { type: 'integer', description: 'the row, 0 to 799' },
        by: { type: 'integer', description: 'wheel steps, negative to scroll up' },
      },
      required: ['x', 'y', 'by'],
      additionalProperties: false,
    },
    output: { ...pictureOutput },
    declaration: {
      effects: ['fetch'],
      destinations: [],
      amount: null,
      content: [],
      results: pictureResults,
    },
    execution: 'direct',
    prepare: (_input, context) => prepareScreenRead(options, context),
    run: async (call, context) => {
      const input = scrollArguments.parse(call.input);
      const refusal = refuseOutsideDisplay(input.x, input.y) ?? refuseWheelSteps(input.by);

      if (refusal !== null) {
        return { status: 'ok', ...refusal };
      }

      const outcome = await runComputerCall(options, {
        run: context.run,
        namedURL: null,
        timeoutMs: readTimeoutMs,
        request: { op: 'screenScroll', x: input.x, y: input.y, by: input.by },
      });

      if (outcome.kind === 'refused' || outcome.reply.kind !== 'screen') {
        return { status: 'ok', ...(outcome.kind === 'refused' ? outcome.result : unexpected()) };
      }

      const result = {
        focus: toFocusResult(options, outcome.reply.focus),
        isWatched: options.computer.isWatched(),
      };

      // the scroll happened, so a picture the desktop could not take leaves it done and unshown
      return outcome.reply.base64 === undefined
        ? { status: 'ok', result: { ...result, isShown: false } }
        : showPicture(options, context.run, {
            isDesktop: true,
            base64: outcome.reply.base64,
            result,
          });
    },
  };
}

// the desktop's size, which a screen point is measured on
const displayWidth = 1280;
const displayHeight = 800;

function refuseOutsideDisplay(x: number, y: number): DirectResult | null {
  const isInside =
    Number.isInteger(x) &&
    Number.isInteger(y) &&
    x >= 0 &&
    x < displayWidth &&
    y >= 0 &&
    y < displayHeight;

  return isInside
    ? null
    : refuseComputer(
        'BAD_POINT',
        `the point is outside the screen: x is 0 to ${String(displayWidth - 1)} and y is 0 to ${String(displayHeight - 1)}`,
      );
}

const maxWheelSteps = 50;

function refuseWheelSteps(by: number): DirectResult | null {
  return Number.isInteger(by) && Math.abs(by) >= 1 && Math.abs(by) <= maxWheelSteps
    ? null
    : refuseComputer(
        'BAD_STEPS',
        `by is a whole number of wheel steps, 1 to ${String(maxWheelSteps)} in either direction`,
      );
}

const queuedNote = [
  ' The call waits for the owner to allow it, per site, and then runs against the window it was ',
  'asked about: if another window is there by then, it is refused with SCREEN_CHANGED. A click ',
  'or a key on the terminal is refused with USE_RUN, and one on the browser’s address bar, tab ',
  'strip or window controls with USE_BROWSER_OPEN: use the browser tools there. Once it runs, the result names the window that has focus ',
  'and shows the desktop after the act beside it.',
].join('');

const actOutput = {
  type: 'object',
  properties: {
    focus: focusSchema,
    isWatched: { type: 'boolean' },
    isShown: { type: 'boolean' },
    refused: { type: 'object' },
  },
  additionalProperties: false,
};

const actResults = {
  focus: 'untrusted',
  isWatched: 'owner_data',
  isShown: 'owner_data',
  refused: 'untrusted',
} as const;

const clickArguments = z.object({
  x: z.number(),
  y: z.number(),
  button: z.enum(['left', 'right']),
});

function buildClickTool(options: ComputerToolOptions, state: ComputerState): ToolDefinition {
  return {
    name: 'computer.screen_click',
    description: [
      'Clicks a point of the desktop, x 0 to 1279 and y 0 to 799, with the left or the right ',
      'button. A point on a screenshot smaller than 1280 wide needs the scaling that the screenshot result gives.',
      screenNote,
      queuedNote,
    ].join(''),
    input: {
      type: 'object',
      properties: {
        x: { type: 'integer', description: 'the column, 0 to 1279' },
        y: { type: 'integer', description: 'the row, 0 to 799' },
        button: { type: 'string', enum: ['left', 'right'] },
      },
      required: ['x', 'y', 'button'],
      additionalProperties: false,
    },
    output: actOutput,
    declaration: {
      effects: ['send'],
      destinations: [],
      requiresDestination: true,
      amount: null,
      content: [],
      results: actResults,
    },
    execution: 'queued',
    prepare: (input, context) => {
      const parsed = clickArguments.parse(input);
      const refusal = refuseOutsideDisplay(parsed.x, parsed.y);

      return refusal === null
        ? prepareScreenAct(options, state, {
            tool: 'computer.screen_click',
            input,
            context,
            act: { kind: 'click', x: parsed.x, y: parsed.y, button: parsed.button },
          })
        : Promise.resolve(refusal);
    },
    run: () =>
      Promise.resolve({ status: 'error', message: 'computer.screen_click runs only queued' }),
  };
}

const prepareTimeoutMs = 30_000;

interface ScreenPreparation {
  readonly tool: string;
  readonly input: JSONObject;
  readonly context: ToolResolveContext;
  readonly act: ScreenAct;
}

// Reads the window the act would land on, which becomes the binding the action runs against and,
// for a browser tab, the destination. The guest refuses an act it would never run, so the owner is
// not asked about it. It keeps the sandbox awake until the action runs or its approval lapses.
async function prepareScreenAct(
  options: ComputerToolOptions,
  state: ComputerState,
  preparation: ScreenPreparation,
): Promise<DirectResult | (Prepared & { readonly expectWindow: JSONObject })> {
  const outcome = await runComputerCall(options, {
    run: preparation.context.run,
    namedURL: null,
    timeoutMs: prepareTimeoutMs,
    request: { op: 'screenBind', act: preparation.act },
  });

  if (outcome.kind === 'refused') {
    return outcome.result;
  }

  if (outcome.reply.kind !== 'screen-target') {
    return unexpected();
  }

  const binding = outcome.reply.target;
  const key = buildActionKey(preparation.tool, preparation.input);

  const picture =
    preparation.act.kind === 'click' && outcome.reply.base64 !== undefined
      ? await fitPicture(options, outcome.reply.base64)
      : null;

  // The card of a click shows the desktop as it was when the call was prepared. The picture is
  // stored with the call, and its digest is part of the window the action hash covers, so a call
  // prepared against a changed screen is a new question.
  const expectWindow = {
    ...toBindingObject(binding),
    ...(picture === null
      ? {}
      : { picture: createHash('sha256').update(picture.bytes).digest('hex') }),
  };

  const kept = (state.screens.get(key) ?? []).filter(
    (entry) => JSON.stringify(entry.expectWindow) !== JSON.stringify(expectWindow),
  );

  state.screens.set(key, [
    ...kept,
    { binding, expectWindow, epoch: options.computer.takeover.epoch() },
  ]);

  state.holds.get(key)?.();
  state.holds.set(key, options.computer.hold(actionProposalLapseMs));

  return {
    destinations: pickScreenDestinations(binding),
    expectWindow,
    ...(picture === null ? {} : { attachments: [new Uint8Array(picture.bytes)] }),
  };
}

function toBindingObject(binding: ScreenBinding): JSONObject {
  return {
    windowID: binding.windowID,
    kind: binding.kind,
    ...(binding.tab === undefined ? {} : { tab: binding.tab }),
    ...(binding.url === undefined ? {} : { url: binding.url }),
  };
}

const maxTypedChars = 1000;

const typeArguments = z.object({
  text: z.string().min(1).max(maxTypedChars).optional(),
  keys: z.string().min(1).optional(),
});

function buildTypeTool(options: ComputerToolOptions, state: ComputerState): ToolDefinition {
  return {
    name: 'computer.screen_type',
    description: [
      'Types into the window that has focus: text, up to 1000 characters, or keys, one chord ',
      'such as enter, shift+tab or ctrl+a. Give exactly one of the two. A chord that moves ',
      'focus to the address bar or opens a tab or a window, such as ctrl+l or ctrl+t, is refused.',
      screenNote,
      queuedNote,
    ].join(''),
    input: {
      type: 'object',
      properties: {
        text: { type: 'string', minLength: 1, maxLength: maxTypedChars },
        keys: { type: 'string', minLength: 1, description: 'one chord, such as shift+tab' },
      },
      oneOf: [{ required: ['text'] }, { required: ['keys'] }],
      additionalProperties: false,
    },
    output: actOutput,
    declaration: {
      effects: ['send'],
      destinations: [],
      requiresDestination: true,
      amount: null,
      content: ['text'],
      results: actResults,
    },
    execution: 'queued',
    prepare: (input, context) => {
      const act = readTypeAct(typeArguments.parse(input));

      return act === null
        ? Promise.resolve(
            refuseComputer('BAD_INPUT', 'give exactly one of text or keys, and not both'),
          )
        : prepareScreenAct(options, state, { tool: 'computer.screen_type', input, context, act });
    },
    run: () =>
      Promise.resolve({ status: 'error', message: 'computer.screen_type runs only queued' }),
  };
}

function readTypeAct(input: z.infer<typeof typeArguments>): ScreenAct | null {
  if (input.text !== undefined && input.keys === undefined) {
    return { kind: 'text', text: input.text };
  }

  return input.keys !== undefined && input.text === undefined
    ? { kind: 'keys', keys: input.keys }
    : null;
}

// The attempt of a queued click or type: the same act against the window it was prepared for. A
// restart loses the binding, and then the act refuses, never running against a screen nobody saw.
// The binding stays until the act reaches a terminal outcome, so a busy computer can be retried.
export async function runScreenAct(
  options: ComputerToolOptions,
  state: ComputerState,
  attempt: ComputerAttempt,
): Promise<DirectResult> {
  const key = buildActionKey(attempt.tool, attempt.arguments);
  const prepared = findPrepared(state.screens.get(key) ?? [], attempt);

  if (prepared === undefined) {
    return refuseComputer('SCREEN_CHANGED', screenMessages.restarted);
  }

  const result =
    prepared.epoch === options.computer.takeover.epoch()
      ? await runPreparedAct(options, attempt, prepared)
      : refuseComputer('SCREEN_CHANGED', screenMessages.held);

  if (result.refusalCode === 'BUSY' || result.refusalCode === 'COMPUTER_MOVING') {
    return result;
  }

  const rest = (state.screens.get(key) ?? []).filter((entry) => entry !== prepared);

  if (rest.length === 0) {
    state.screens.delete(key);
    state.holds.get(key)?.();
    state.holds.delete(key);
  } else {
    state.screens.set(key, rest);
  }

  return result;
}

// The entry whose window the owner's answer covers: the action hash names the window and the
// picture the call was prepared against, so a changed screen finds no entry.
function findPrepared(
  entries: readonly ScreenPrepared[],
  attempt: ComputerAttempt,
): ScreenPrepared | undefined {
  return entries.find(
    (entry) =>
      buildActionHash({
        tool: attempt.tool,
        input: attempt.arguments,
        destinations: attempt.destinations,
        deadlineAt: attempt.deadlineAt,
        expectWindow: entry.expectWindow,
      }) === attempt.actionHash,
  );
}

async function runPreparedAct(
  options: ComputerToolOptions,
  attempt: ComputerAttempt,
  prepared: ScreenPrepared,
): Promise<DirectResult> {
  const binding = prepared.binding;

  if (!isSameList(pickScreenDestinations(binding), attempt.destinations)) {
    return refuseComputer(
      'SCREEN_CHANGED',
      'the window this call was prepared for is not the one the owner allowed',
    );
  }

  const act =
    attempt.tool === 'computer.screen_click'
      ? readClickAct(clickArguments.parse(attempt.arguments))
      : readTypeAct(typeArguments.parse(attempt.arguments));

  if (act === null) {
    return refuseComputer('BAD_INPUT', 'give exactly one of text or keys, and not both');
  }

  const called = await options.computer.call({
    timeoutMs: 60_000,
    ...makeActionScans(options),
    request: { op: 'screenAct', binding, act },
  });

  const outcome = sortCallResult(called);

  if (outcome.kind === 'refused') {
    return outcome.result;
  }

  if (outcome.reply.kind !== 'screen') {
    return unexpected();
  }

  const picture =
    outcome.reply.base64 === undefined ? null : await fitPicture(options, outcome.reply.base64);

  // the act ran either way; isShown says whether a picture of the desktop follows it
  return {
    result: {
      focus: toFocusResult(options, outcome.reply.focus),
      isWatched: options.computer.isWatched(),
      isShown: picture !== null,
    },
    ...(picture === null ? {} : { images: [picture] }),
  };
}

function readClickAct(input: z.infer<typeof clickArguments>): ScreenAct {
  return { kind: 'click', x: input.x, y: input.y, button: input.button };
}
