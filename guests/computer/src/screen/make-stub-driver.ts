import type { Page } from 'playwright-core';
import { displayHeight, displayWidth } from '../desktop/constants';
import { buildKeyNames } from './build-key-names';
import type { DesktopDriver } from './types';

const wheelStepPixels = 100;
const stubWindowID = 'stub-browser';

// The desktop of the test build, which has no display: one browser window the size of the display,
// whose page is the newest tab. Pointer and key events go to that page, and the picture is the page's
// own. It lets every screen tool run where no display exists.
export function makeStubDriver(tabs: ReadonlyMap<string, { readonly page: Page }>): DesktopDriver {
  const readPage = (): Page => {
    const page = [...tabs.values()].at(-1)?.page;

    if (page === undefined) {
      throw new Error('the browser has no tab open');
    }

    return page;
  };

  return {
    readWindows: () =>
      Promise.resolve({
        windows: [
          {
            id: stubWindowID,
            kind: 'browser',
            x: 0,
            y: 0,
            width: displayWidth,
            height: displayHeight,
          },
        ],
        activeID: stubWindowID,
      }),
    capture: () => readPage().screenshot({ type: 'png' }),
    click: (x, y, button) => readPage().mouse.click(x, y, { button }),
    scroll: async (x, y, steps) => {
      const page = readPage();

      await page.mouse.move(x, y);
      await page.mouse.wheel(0, steps * wheelStepPixels);
    },
    typeText: (text) => readPage().keyboard.type(text),
    pressChord: (chord) => readPage().keyboard.press(buildKeyNames(chord, 'browser')),
  };
}
