# The browser lane

The web app's browser suites, the `*.browser.test.ts` files, drive a headless Chrome or Chromium
through `Bun.WebView`, so `bun test` needs one that Bun finds on `PATH`, in a standard install
location, or at `BUN_CHROME_PATH`. GitHub's Ubuntu runners ship Chrome. `bun run test` leaves the
browser suites out of the parallel run, and `test:browser`, the browser lane, runs them.

The browser lane runs every suite on one setup. Its script runs
[`run-browser-lane.ts`](../../../../apps/web/src/test-utils/run-browser-lane.ts) under the shared
cgroup memory cap, locally and on CI. That command builds the web client and the image module's
bundle once into a folder for the run under `node_modules/.cache/nixie-browser-runs`, then runs
`bun test --parallel=1 --no-isolate`, which runs the files one after another in one test process
with one global object. It names the run in `NIXIE_BROWSER_RUN_ID`, which the preload and the suites
read to find the builds. It removes the run's folders when the tests end, and its start removes
those of a lane that died.

The test process keeps one Chrome for every file. The preload,
[`start-browser.ts`](../../../../apps/web/src/test-utils/start-browser.ts), starts it before the
first test, because a cold Chrome start on a fresh CI runner can outlast a test's limit. The preload
also refuses a run with no build. Open every view through
[`createBrowserView`](../../../../apps/web/src/test-utils/create-browser-view.ts), and close it in
`onTestFinished`. The first view's options set the process's one Chrome, and `createBrowserView`
keeps its Chrome profile in a folder of its own in the run's folder. Every view shares that Chrome's
cookie jar, so a suite that reads cookies clears them in its `setupTest()`. Run code in the page
through [`runInPage`](../../../../apps/web/src/test-utils/run-in-page.ts), which takes a typed
function and a schema for its result. Keep `view.evaluate` for a one-line expression.

Chrome and Chromium stop at startup when the socket path under `TMPDIR` is too long for a Unix
socket, and Bun starts Chrome with the environment its process started with. So the lane command
sets `TMPDIR` for the test processes to a folder for the run, under `/tmp` when the host's `TMPDIR`
is too long. Outside CI, each browser suite skips and prints why when no browser starts, through
[`checkBrowserSkip`](../../../../apps/web/src/test-utils/check-browser-skip.ts), and the preload
runs the same check, so the run goes on. In CI the check fails the run instead.
