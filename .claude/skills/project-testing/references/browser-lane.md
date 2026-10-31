# The browser lane

The web app's browser suites, the `*.browser.test.ts` files, drive a headless Chrome or Chromium
through `Bun.WebView`, so `bun test` needs one that Bun finds on `PATH`, in a standard install
location, or at `BUN_CHROME_PATH`. GitHub's Ubuntu runners ship Chrome. `bun run test` leaves the
browser suites out of the parallel run, and `test:browser`, the browser lane, runs them. The
parallel run's ignore patterns repeat the root config's, because a pattern given on the command line
replaces that list.

The browser lane runs every suite on one setup. Its script runs
[`run-browser-lane.ts`](../../../../apps/web/src/test-utils/run-browser-lane.ts) under the shared
cgroup memory cap, locally and on CI. That command builds the web client and the image module's
bundle once into a folder for the run under `node_modules/.cache/nixie-browser-runs`, then runs
`bun test --parallel=1`, which runs the files one after another and isolates each one. It names the
run in `NIXIE_BROWSER_RUN_ID`, because the preload and the suites run again for each file. It
removes the run's folders when the tests end, and its start removes those of a lane that died.

The isolation stops each file's Chrome when the file ends, and the preload,
[`start-browser.ts`](../../../../apps/web/src/test-utils/start-browser.ts), starts the next file's
Chrome before its first test, because a cold Chrome start on a fresh CI runner can outlast a test's
limit. The preload also refuses a run with no build. Every suite opens its views through
[`createBrowserView`](../../../../apps/web/src/test-utils/create-browser-view.ts), because the first
view's options set the file's one Chrome. It keeps each file's Chrome profile in a folder of its own
in the run's folder. A test runs code in the page through
[`runInPage`](../../../../apps/web/src/test-utils/run-in-page.ts), which takes a typed function and
a schema for its result, and keeps `view.evaluate` for a one-line expression.

Chrome and Chromium stop at startup when the socket path under `TMPDIR` is too long for a Unix
socket, and Bun starts Chrome with the environment its process started with. So the lane command
sets `TMPDIR` for the test processes to a folder for the run, under `/tmp` when the host's `TMPDIR`
is too long. Outside CI, each browser suite skips and prints why when no browser starts, through
[`checkBrowserSkip`](../../../../apps/web/src/test-utils/check-browser-skip.ts), and the preload
runs the same check, so the run goes on. In CI the check fails the run instead.
