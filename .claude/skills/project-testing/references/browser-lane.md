# The browser lane

The web app's browser suites, the `*.browser.test.ts` files, drive a headless Chrome or Chromium
through `Bun.WebView`. Run them with `bun run test:browser` from the repo root, which runs every
browser suite in one test process, one file after another, with one global object and one Chrome.

## Traps

- **Start the suites only through `bun run test:browser`.** The lane script,
  [`run-browser-lane.ts`](../../../../apps/web/src/test-utils/run-browser-lane.ts), builds the web
  client before the tests start. The browser preload,
  [`start-browser.ts`](../../../../apps/web/src/test-utils/start-browser.ts), refuses a test process
  that has no such build.
- **Read the lane's result on CI when your host has no browser.** Bun looks for Chrome or Chromium
  on `PATH`, in a standard install location, or at `BUN_CHROME_PATH`. Outside CI,
  [`checkBrowserSkip`](../../../../apps/web/src/test-utils/check-browser-skip.ts) skips every suite
  when Chrome fails to start, so the lane passes with no test run. In CI the same function fails the
  lane.
- **Open every view through
  [`createBrowserView()`](../../../../apps/web/src/test-utils/create-browser-view.ts).** The test
  process runs one Chrome, which starts with the options of the first view any suite opens. Bun
  ignores the options of each later view, and `createBrowserView()` gives every view the same ones.
- **Clear the cookies before each test.** Every view shares the one Chrome's cookie jar, across
  files too.
- **Undo in `onTestFinished` each global your suite changes.** The next file runs on the same global
  object, and the root preloads reset only what they set up.
- **Keep a child process's `TMPDIR` short.** Chrome stops at startup when
  `<TMPDIR>/org.chromium.Chromium.XXXXXX/SingletonSocket` passes 107 bytes. The lane picks a short
  `TMPDIR` for its own test process, so the limit matters only for a suite that starts Chrome in a
  child process.

## Write a suite

Start from an existing suite, such as
[`memory.browser.test.ts`](../../../../apps/web/src/routes/memory.browser.test.ts):

1. At module level, await `checkBrowserSkip()`, and pass its `isSkipped` to each `test.skipIf`.
2. In `setupTest()`, open the view through `createBrowserView()`, and close it in `onTestFinished`.
3. Still in `setupTest()`, navigate the view to `about:blank`, then clear the cookies with
   `view.cdp('Network.clearBrowserCookies')`.
4. Run code in the page through [`runInPage`](../../../../apps/web/src/test-utils/run-in-page.ts),
   which takes a typed function and a zod schema for its result. Keep `view.evaluate` for a one-line
   expression.
