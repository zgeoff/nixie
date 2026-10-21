// A Chrome cold start on a fresh CI runner can run past the test timeout, so the preload starts
// it before the first test. Bun keeps that Chrome for the whole process.

import { checkBrowserSkip } from './check-browser-skip';

await checkBrowserSkip();
