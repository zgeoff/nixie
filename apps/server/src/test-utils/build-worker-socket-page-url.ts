// The URL of a page whose Worker tries a WebSocket to each given URL in turn. The page's title is
// `waiting` until the Worker has tried them all, then one `open` or `failed` for each, joined by
// commas, in the order given.
export function buildWorkerSocketPageURL(socketURLs: readonly string[]): string {
  // A Worker of a data URL runs a classic script, where a top-level await does not parse.
  const worker = [
    '(async () => {',
    `const urls = ${JSON.stringify(socketURLs)};`,
    'const results = [];',
    'for (const url of urls) {',
    '  results.push(await new Promise((done) => {',
    '    try {',
    '      const socket = new WebSocket(url);',
    "      socket.onopen = () => { socket.close(); done('open'); };",
    "      socket.onerror = () => done('failed');",
    "      socket.onclose = () => done('failed');",
    "    } catch { done('failed'); }",
    '  }));',
    '}',
    "postMessage(results.join(','));",
    '})();',
  ].join('\n');

  const page = [
    '<title>waiting</title>',
    '<script>',
    `const worker = new Worker('data:text/javascript,' + encodeURIComponent(${JSON.stringify(worker)}));`,
    'worker.onmessage = (event) => { document.title = event.data; };',
    '</script>',
  ].join('');

  return `data:text/html,${encodeURIComponent(page)}`;
}
