// The browser lane preloads this module to start Chrome before the first test, so a cold start
// that runs past the test timeout on a fresh CI runner never counts against a test. Bun keeps that
// Chrome for the whole process once the view closes, and every view the suites open shares it.

// Chrome's sandbox needs user namespaces that a container or a root user lacks
const view = new Bun.WebView({ backend: { argv: ['--no-sandbox'], type: 'chrome', url: false } });

await view.navigate('about:blank');

view.close();
