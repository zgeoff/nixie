// The browser lane preloads this module to start Chrome before the first test, so a cold start
// that runs past the test timeout on a fresh CI runner never counts against a test. Bun keeps that
// Chrome for the whole process once the view closes, and every view the suites open shares it.

import { checkBrowserSkip } from './check-browser-skip';

// outside CI a host whose Chrome cannot start skips the browser suites, so the start never fails
// the run there
await checkBrowserSkip();
