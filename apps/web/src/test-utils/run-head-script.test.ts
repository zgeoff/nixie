import { expect, onTestFinished, test } from 'bun:test';
import type { Window } from 'happy-dom';
import { runHeadScript } from './run-head-script';

test('it runs the script text in the document', () => {
  onTestFinished(() => {
    delete globalThis.document.body.dataset['ran'];
  });

  runHeadScript('document.body.dataset.ran = "yes"');

  expect(globalThis.document.body.dataset['ran']).toBe('yes');
});

test('it leaves no script element and JavaScript evaluation off', () => {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the preload registered happy-dom's window
  const window = globalThis as unknown as Window;

  runHeadScript('void 0');

  expect(globalThis.document.querySelectorAll('script')).toHaveLength(0);
  expect(window.happyDOM.settings.enableJavaScriptEvaluation).toBeFalse();
});
