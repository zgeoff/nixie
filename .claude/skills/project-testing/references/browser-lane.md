# The browser lane

Write, run and debug the web app's browser suites, the `*.browser.test.ts` files, with the rules
below. Each suite drives a headless Chrome or Chromium through `Bun.WebView`. The traps: a suite
started outside the lane has no web build, a view's options never reach Chrome, and every file
shares one Chrome and one global object.

rig, the test runner `@zgeoff/rig`, runs the lane:

- `bun run test:browser` runs every browser suite outside `e2e/`.
- `bun run test:journeys` runs the user journeys in `e2e/journeys/`, as
  [Journeys](./e2e-and-restic-lanes.md#journeys) describes.

Each command first runs the `build:browser` script, which builds the web client. It then runs the
suites one file after another in one test process. A test preload of rig's, a module that Bun loads
before the first test file, starts one Chrome for that process. Run the command again after you
change the web client: each run builds it once, at its start.

## Traps

- **Start a browser suite only through one of the 2 commands.**
  [`write-browser-build.ts`](../../../../apps/web/src/test-utils/write-browser-build.ts), the
  `build:browser` script, writes the web build to the folder that rig sets in
  `RIG_BROWSER_BUILD_DIR`. A suite reads the build through
  [`readBrowserBuild`](../../../../apps/web/src/test-utils/read-browser-build.ts), which throws when
  that variable is not set.
- **When your host has no Chrome or Chromium, push the branch and read the lane's result on CI.**
  Bun looks for the browser on `PATH`, in a standard install location, or at `BUN_CHROME_PATH`.
  rig's preload fails the lane when Chrome does not start.
- **Open every view with `new Bun.WebView({ backend: 'chrome' })`.** `backend: 'chrome'` picks the
  engine. The one Chrome starts with the options of the first view, which rig's preload opens, and
  Bun ignores every other option of a later view.
- **Clear the cookies before each test.** Every view shares the one Chrome's cookie jar, across
  files too.
- **Undo in `onTestFinished` each change your suite makes to `globalThis`, such as a stubbed
  `fetch`.** The next file runs in the same process, and the preloads in the root `bunfig.toml`
  reset only what they set up.
- **When a suite starts Chrome in a child process, give the child a `TMPDIR` of 50 bytes or fewer.**
  Chrome stops at startup when the path `<TMPDIR>/org.chromium.Chromium.XXXXXX/SingletonSocket`
  passes 107 bytes. rig gives the lane's own test process a short `TMPDIR`.

## Write a suite

Start from an existing suite, such as
[`memory.browser.test.ts`](../../../../apps/web/src/routes/memory.browser.test.ts), and copy how it
serves the web build and opens its page.

1. In `setupTest()`, open the view with `new Bun.WebView({ backend: 'chrome' })`, and close it in
   `onTestFinished`.
2. Still in `setupTest()`, navigate the view to `about:blank`, then clear the cookies with
   `view.cdp('Network.clearBrowserCookies')`.
3. Run code in the page through `runInPage(view, pageFunction, argument, schema)` from
   `@zgeoff/rig`. `pageFunction` is an arrow function that sees only `argument` and the page's
   globals, and `schema` is a zod schema for its result. Keep `view.evaluate` for a one-line
   expression.
