import type { Window } from 'happy-dom';

// Runs an inline script's text the way the browser runs a script in the document's head: as a
// script element, with nothing else in scope. happy-dom runs scripts only while JavaScript
// evaluation is on, so this turns it on for the one script and off again, and removes the element.
export function runHeadScript(text: string): void {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the preload registered happy-dom's window
  const window = globalThis as unknown as Window;
  const script = globalThis.document.createElement('script');

  script.textContent = text;
  window.happyDOM.settings.enableJavaScriptEvaluation = true;
  globalThis.document.head.append(script);
  window.happyDOM.settings.enableJavaScriptEvaluation = false;
  script.remove();
}
