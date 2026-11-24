import type { ScreenBinding } from '@heynixie/wire';

export type WindowKind = ScreenBinding['kind'];

export interface DesktopWindow {
  readonly id: string;
  readonly kind: WindowKind;

  // the window's client area on the display
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface DesktopWindows {
  // every visible window, from the bottom of the stack to the top
  readonly windows: readonly DesktopWindow[];

  // the window that has focus, if any
  readonly activeID: string | null;
}

// A key chord such as ctrl+shift+n, as lowercase names: the modifiers in the order ctrl, alt, shift,
// super, then the key
export type Chord = readonly string[];

// What the guest does to the desktop and reads from it. A display of its own implements it in the
// image, and a stand-in over the headless browser implements it in the test build.
export interface DesktopDriver {
  readonly readWindows: () => Promise<DesktopWindows>;

  // the title of a window, empty when it has none or has closed
  readonly readTitle: (id: string) => Promise<string>;
  readonly capture: () => Promise<Uint8Array>;
  readonly click: (x: number, y: number, button: 'left' | 'right') => Promise<void>;

  // positive steps scroll down, negative up
  readonly scroll: (x: number, y: number, steps: number) => Promise<void>;
  readonly typeText: (text: string) => Promise<void>;
  readonly pressChord: (chord: Chord) => Promise<void>;
}

// the part of a page that the guest reads to tell which tab a browser window shows
export interface ScreenPage {
  readonly url: () => string;
  readonly evaluate: (script: string) => Promise<unknown>;
}

export type ScreenTabs = ReadonlyMap<string, { readonly page: ScreenPage }>;

// The window a screen act lands on, with the part of it that the browser's own controls cover
export interface ScreenTarget {
  readonly binding: ScreenBinding;

  // for a browser window, the display row where the page begins; a point above it is on the tab
  // strip or the address bar
  readonly pageTop: number | null;
}

export type ScreenSelection =
  | { readonly kind: 'point'; readonly x: number; readonly y: number }
  | { readonly kind: 'focus' };
