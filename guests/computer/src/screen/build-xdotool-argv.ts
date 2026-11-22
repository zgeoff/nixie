import { match } from 'ts-pattern';
import { buildKeyNames } from './build-key-names';
import type { Chord } from './types';

export type XdotoolCommand =
  | {
      readonly kind: 'click';
      readonly x: number;
      readonly y: number;
      readonly button: 'left' | 'right';
    }

  // positive steps turn the wheel down, negative up
  | { readonly kind: 'scroll'; readonly x: number; readonly y: number; readonly steps: number }
  | { readonly kind: 'type'; readonly text: string }
  | { readonly kind: 'key'; readonly chord: Chord };

// The xdotool command for an input. A click and a scroll first move the pointer to the point. Text
// follows `--`, so text that starts with a dash is still text.
export function buildXdotoolArgv(command: XdotoolCommand): string[] {
  return match(command)
    .with({ kind: 'click' }, (click) => [
      'xdotool',
      'mousemove',
      String(click.x),
      String(click.y),
      'click',
      click.button === 'left' ? '1' : '3',
    ])
    .with({ kind: 'scroll' }, (scroll) => [
      'xdotool',
      'mousemove',
      String(scroll.x),
      String(scroll.y),
      'click',
      '--repeat',
      String(Math.abs(scroll.steps)),
      '--delay',
      '20',
      scroll.steps < 0 ? '4' : '5',
    ])
    .with({ kind: 'type' }, (type) => [
      'xdotool',
      'type',
      '--clearmodifiers',
      '--delay',
      '12',
      '--',
      type.text,
    ])
    .with({ kind: 'key' }, (key) => [
      'xdotool',
      'key',
      '--clearmodifiers',
      '--',
      buildKeyNames(key.chord, 'x'),
    ])
    .exhaustive();
}
