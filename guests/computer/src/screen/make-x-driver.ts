import { readFile } from 'node:fs/promises';
import { buildXdotoolArgv } from './build-xdotool-argv';
import { parseActiveWindow } from './parse-active-window';
import { parseFrameExtents } from './parse-frame-extents';
import { parseWindowClass } from './parse-window-class';
import { parseWindowGeometry } from './parse-window-geometry';
import { parseWindowIDs } from './parse-window-ids';
import { pickWindowKind } from './pick-window-kind';
import type { DesktopDriver, DesktopWindow, DesktopWindows } from './types';

export interface XDriverOptions {
  // Runs a command against the display as its user, and returns its standard output. A failed
  // command rejects.
  readonly runTool: (argv: readonly string[]) => Promise<string>;

  // where the screenshot tool writes its picture, a path that the display's user can write
  readonly shotPath: string;
}

// Drives the virtual display through xdotool, xprop, xwininfo and scrot. The caller runs each tool as
// the display's own user, in the sandbox's network namespace, where the display's socket is. A
// command in the terminal's namespace never reaches it.
export function makeXDriver(options: XDriverOptions): DesktopDriver {
  return {
    readWindows: () => readWindows(options),
    capture: async () => {
      await options.runTool(['scrot', '-o', '-z', options.shotPath]);

      return readFile(options.shotPath);
    },
    click: async (x, y, button) => {
      await options.runTool(buildXdotoolArgv({ kind: 'click', x, y, button }));
    },
    scroll: async (x, y, steps) => {
      await options.runTool(buildXdotoolArgv({ kind: 'scroll', x, y, steps }));
    },
    typeText: async (text) => {
      await options.runTool(buildXdotoolArgv({ kind: 'type', text }));
    },
    pressChord: async (chord) => {
      await options.runTool(buildXdotoolArgv({ kind: 'key', chord }));
    },
  };
}

async function readWindows(options: XDriverOptions): Promise<DesktopWindows> {
  const stacking = await options.runTool(['xprop', '-root', '_NET_CLIENT_LIST_STACKING']);
  const active = await options.runTool(['xprop', '-root', '_NET_ACTIVE_WINDOW']);

  const windows: DesktopWindow[] = [];

  for (const id of parseWindowIDs(stacking)) {
    const window = await readWindow(options, id);

    if (window !== null) {
      windows.push(window);
    }
  }

  return { windows, activeID: parseActiveWindow(active) };
}

// A window's rectangle includes its frame, so a point on a title bar or a close button belongs to the
// window and never falls through to the one beneath. A window that closed since the list was read,
// or is not on the display, is left out.
async function readWindow(options: XDriverOptions, id: string): Promise<DesktopWindow | null> {
  try {
    const classText = await options.runTool(['xprop', '-id', id, 'WM_CLASS']);
    const infoText = await options.runTool(['xwininfo', '-id', id]);
    const frameText = await options.runTool(['xprop', '-id', id, '_NET_FRAME_EXTENTS']);

    const windowClass = parseWindowClass(classText);
    const geometry = parseWindowGeometry(infoText);
    const frame = parseFrameExtents(frameText);

    if (geometry === null || !geometry.isViewable) {
      return null;
    }

    return {
      id,
      kind: pickWindowKind(windowClass),
      x: geometry.x - frame.left,
      y: geometry.y - frame.top,
      width: geometry.width + frame.left + frame.right,
      height: geometry.height + frame.top + frame.bottom,
    };
  } catch {
    return null;
  }
}
