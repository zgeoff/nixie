import type {
  ComputerFocus,
  ComputerReply,
  ComputerRequest,
  ScreenAct,
  ScreenBinding,
} from '@heynixie/wire';
import { match } from 'ts-pattern';
import { displayHeight, displayWidth } from '../desktop/constants';
import { parseChord } from './parse-chord';
import type { ScreenCheck } from './pick-screen-refusal';
import { pickScreenRefusal } from './pick-screen-refusal';
import { resolveScreenTarget } from './resolve-screen-target';
import type { Chord, DesktopDriver, ScreenSelection, ScreenTabs } from './types';

export type ScreenRequest = Extract<
  ComputerRequest,
  { op: 'desktopShot' | 'screenScroll' | 'screenBind' | 'screenAct' }
>;

export interface ScreenContext {
  readonly driver: DesktopDriver;
  readonly tabs: ScreenTabs;

  // how long the display takes to show the result of an input, before its picture is taken
  readonly settleMs: number;
}

// Answers the requests that read or drive the whole desktop. A screen act lands on the window that
// holds its point, or for typing on the focused one, and only when that window is the one the act
// was prepared for.
export async function handleScreenRequest(
  context: ScreenContext,
  request: ScreenRequest,
): Promise<ComputerReply> {
  try {
    return await match(request)
      .with({ op: 'desktopShot' }, () => shootDesktop(context))
      .with({ op: 'screenScroll' }, (scroll) => scrollScreen(context, scroll))
      .with({ op: 'screenBind' }, (bind) => bindScreenAct(context, bind.act))
      .with({ op: 'screenAct' }, (act) => runScreenAct(context, act.act, act.binding))
      .exhaustive();
  } catch (error) {
    return {
      kind: 'failed',
      ok: false,
      reason: 'failed',
      message: error instanceof Error ? error.message : 'the desktop did not answer',
    };
  }
}

async function shootDesktop(context: ScreenContext): Promise<ComputerReply> {
  const focus = await readFocus(context);
  const bytes = await context.driver.capture();

  return {
    kind: 'desktop',
    ok: true,
    width: displayWidth,
    height: displayHeight,
    focus,
    base64: Buffer.from(bytes).toString('base64'),
  };
}

async function readFocus(context: ScreenContext): Promise<ComputerFocus> {
  const target = await resolveScreenTarget(context.driver, context.tabs, { kind: 'focus' });

  const binding = target.binding;

  if (binding.kind === 'browser' && binding.tab !== undefined && binding.url !== undefined) {
    return { kind: 'browser', tab: binding.tab, url: binding.url };
  }

  return { kind: binding.kind === 'terminal' ? 'terminal' : 'other' };
}

async function scrollScreen(
  context: ScreenContext,
  scroll: Extract<ScreenRequest, { op: 'screenScroll' }>,
): Promise<ComputerReply> {
  const target = await resolveScreenTarget(context.driver, context.tabs, {
    kind: 'point',
    x: scroll.x,
    y: scroll.y,
  });

  const refusal = pickScreenRefusal(target, { kind: 'scroll' }, null);

  if (refusal !== null) {
    return refusal;
  }

  await context.driver.scroll(scroll.x, scroll.y, scroll.by);

  return pictureAfterInput(context);
}

// The input has landed by now, so a focus or a picture that cannot be read never fails the act: a
// window that cannot be read counts as another window, and a picture that cannot be taken is left
// out of the reply.
async function pictureAfterInput(context: ScreenContext): Promise<ComputerReply> {
  await Bun.sleep(context.settleMs);

  const focus = await readFocus(context).catch((): ComputerFocus => ({ kind: 'other' }));
  const bytes = await context.driver.capture().catch(() => null);

  return {
    kind: 'screen',
    ok: true,
    focus,
    ...(bytes === null ? {} : { base64: Buffer.from(bytes).toString('base64') }),
  };
}

const badKeys: ComputerReply = {
  kind: 'failed',
  ok: false,
  reason: 'bad_keys',
  message: 'keys is one chord, such as enter, shift+tab or ctrl+a',
};

async function bindScreenAct(context: ScreenContext, act: ScreenAct): Promise<ComputerReply> {
  const checked = readCheck(act);

  if (checked === null) {
    return badKeys;
  }

  const target = await resolveScreenTarget(context.driver, context.tabs, pickSelection(act));

  const refusal = pickScreenRefusal(target, checked.check, null);

  if (refusal !== null) {
    return refusal;
  }

  if (act.kind !== 'click') {
    return { kind: 'screen-target', ok: true, target: target.binding };
  }

  const bytes = await context.driver.capture();

  return {
    kind: 'screen-target',
    ok: true,
    target: target.binding,
    base64: Buffer.from(bytes).toString('base64'),
  };
}

interface CheckedAct {
  readonly check: ScreenCheck;
  readonly chord: Chord;
}

function readCheck(act: ScreenAct): CheckedAct | null {
  if (act.kind === 'click') {
    return { check: { kind: 'click', y: act.y }, chord: [] };
  }

  if (act.kind === 'text') {
    return { check: { kind: 'text' }, chord: [] };
  }

  const chord = parseChord(act.keys);

  return chord === null ? null : { check: { kind: 'chord', chord }, chord };
}

// A click lands on the window under its point, and a type on the window that has focus.
function pickSelection(act: ScreenAct): ScreenSelection {
  return act.kind === 'click' ? { kind: 'point', x: act.x, y: act.y } : { kind: 'focus' };
}

async function runScreenAct(
  context: ScreenContext,
  act: ScreenAct,
  binding: ScreenBinding,
): Promise<ComputerReply> {
  const checked = readCheck(act);

  if (checked === null) {
    return badKeys;
  }

  const target = await resolveScreenTarget(context.driver, context.tabs, pickSelection(act));

  const refusal = pickScreenRefusal(target, checked.check, binding);

  if (refusal !== null) {
    return refusal;
  }

  await match(act)
    .with({ kind: 'click' }, (click) => context.driver.click(click.x, click.y, click.button))
    .with({ kind: 'text' }, (text) => context.driver.typeText(text.text))
    .with({ kind: 'keys' }, () => context.driver.pressChord(checked.chord))
    .exhaustive();

  return pictureAfterInput(context);
}
