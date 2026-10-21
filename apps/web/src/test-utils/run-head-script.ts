// happy-dom runs scripts only while JavaScript evaluation is on, so this turns it on for the one
// script and off again.
export function runHeadScript(text: string): void {
  const script = globalThis.document.createElement('script');

  script.textContent = text;
  globalThis.happyDOM.settings.enableJavaScriptEvaluation = true;

  globalThis.document.head.append(script);

  globalThis.happyDOM.settings.enableJavaScriptEvaluation = false;

  script.remove();
}
