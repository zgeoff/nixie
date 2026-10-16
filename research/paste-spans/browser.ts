/* oxlint-disable no-await-in-loop, one-var, max-statements, no-continue -- a script: each browser and each step runs in order */
// Drives a textarea in Chromium, Firefox and WebKit with real key presses and a real clipboard,
// and prints the spans the page recorded after each step.
// Usage: bun browser.ts
import type { BrowserType, Page } from 'playwright-core';
import { chromium, firefox, webkit } from 'playwright-core';

interface PageState {
  inputTypes: string[];
  spans: string[];
}

const built = await Bun.build({ entrypoints: [`${import.meta.dir}/page.ts`], target: 'browser' });
const script = await built.outputs[0]?.text();
const html = `<input id="source" value="PASTED"><textarea></textarea><script>${script}</script>`;

async function runCopySource(page: Page): Promise<void> {
  await page.focus('#source');
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('ControlOrMeta+C');
  await page.focus('textarea');
}

async function setCaret(page: Page, start: number, end: number): Promise<void> {
  await page.focus('textarea');
  await page.evaluate(
    (range) => {
      document.querySelector('textarea')?.setSelectionRange(range[0], range[1]);
    },
    [start, end],
  );
}

async function printState(page: Page, label: string): Promise<void> {
  const state = (await page.evaluate('readState()')) as PageState;
  console.log(`  ${label.padEnd(30)} ${state.spans.join(' ')}`);
}

async function runSteps(page: Page): Promise<void> {
  await page.focus('textarea');
  await page.keyboard.type('hello ');
  await runCopySource(page);
  await page.keyboard.press('ControlOrMeta+V');
  await printState(page, 'type, paste');
  await page.keyboard.type(' world');
  await printState(page, 'type after the paste');
  await setCaret(page, 9, 9);
  await page.keyboard.type('x');
  await printState(page, 'type inside the paste');
  await setCaret(page, 6, 13);
  await page.keyboard.press('Backspace');
  await printState(page, 'delete the pasted text');
  await page.keyboard.press('ControlOrMeta+Z');
  await printState(page, 'undo the delete');
  await page.keyboard.insertText(' café');
  await printState(page, 'insertText (as an IME would)');
  await setCaret(page, 0, 5);
  await page.keyboard.press('ControlOrMeta+V');
  await printState(page, 'paste over a selection');
}

for (const browserType of [chromium, firefox, webkit] as BrowserType[]) {
  console.log(browserType.name());
  const browser = await browserType.launch().catch((error: unknown) => {
    console.log(`  could not launch: ${String(error).split('\n')[0]}`);
    return null;
  });
  if (!browser) {
    continue;
  }
  const page = await browser.newPage();
  await page.setContent(html);
  try {
    await runSteps(page);
    const state = (await page.evaluate('readState()')) as PageState;
    console.log(`  inputTypes: ${[...new Set(state.inputTypes)].join(', ')}`);
  } catch (error) {
    console.log(`  failed: ${String(error).split('\n')[0]}`);
  }
  await browser.close();
}
