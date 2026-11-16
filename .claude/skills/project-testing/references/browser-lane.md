# The browser lane

Load this before you write, run or debug a web app browser suite, a `*.browser.test.ts` file. Each
suite drives a headless Chrome or Chromium through `Bun.WebView`. The lane has four traps: a suite
started outside the lane has no web build, a later view's options never reach Chrome, every file
shares one Chrome and one global object, and a click misses when the page moves just before it.

rig, the test runner `@zgeoff/rig`, runs the lane with 2 commands:

- `bun run test:browser` runs every browser suite outside the root `e2e/` folder.
- `bun run test:journeys` runs the user journeys in the root `e2e/journeys/` folder, as
  [Journeys](./e2e-and-restic-lanes.md#journeys) describes.

Each command first runs the `build:browser` script, which builds the web client. It then runs the
suites one file after another in one test process. Run the command again after you change the web
client: each command builds the client once, when it starts.

Jump to [Traps](#traps) or [Write a suite](#write-a-suite).

A preload is a module that Bun loads before any test file. 2 kinds apply here:

- **The browser preload** is rig's own. rig adds it to the lane's test command. It starts the one
  Chrome for the process and opens the first view.
- **The root preloads** are the `[test].preload` list in the root `bunfig.toml`. They apply to every
  `bun test` run, and they set up and reset globals: stubs, matchers and the mock server.

## Traps

- **Start a browser suite only through `bun run test:browser` or `bun run test:journeys`.**
  [`write-browser-build.ts`](../../../../apps/web/src/test-utils/write-browser-build.ts), the
  `build:browser` script, writes the web build to the folder that rig sets in
  `RIG_BROWSER_BUILD_DIR`. A suite reads the build through
  [`readBrowserBuild`](../../../../apps/web/src/test-utils/read-browser-build.ts), which throws when
  that variable is not set.
- **When your host has no Chrome or Chromium, push the branch and read the lane's result on CI.**
  The `pr / test-browser` check runs `bun run test:browser`, and the `journeys` check runs
  `bun run test:journeys`. Bun looks for the browser on `PATH`, in a standard install location, or
  at `BUN_CHROME_PATH`. The browser preload fails the lane when Chrome does not start.
- **Open every view with `new Bun.WebView({ backend: 'chrome' })`.** `backend: 'chrome'` picks
  Chrome as the view's engine. Pass no other option: the one Chrome starts with the options of the
  first view, which the browser preload opens, and Bun ignores the options of each later view. For
  that reason a view's options cannot set the viewport size. Set it as
  [Write a suite](#write-a-suite) step 5 says.
- **Clear the cookies before each test.** Every view shares the one Chrome's cookie jar, across
  files too.
- **Before each click, call [`waitForPage`](../../../../apps/web/src/test-utils/wait-for-page.ts)
  with an expression that turns `true` once the page shows the data it fetches in the browser.**
  Check for a list row, or for the empty-list text with `document.body.innerText.includes(...)`. The
  helper waits for exactly `true`, so pass a check, never the text itself. When the data arrives,
  React renders the list and moves each element below the list. `view.click` measures where its
  target is, then clicks at that point a moment later. A move between the two sends the click to
  another element. React renders fetched data only after hydration, so this wait also shows that the
  page hydrated. Leave out `_reactListening` on `document`: React sets that key before it hydrates
  the page's components.
- **To check that a control does not move when the page's data arrives, delay the stub API's answer
  to that data's request.** Call `delayPath(path, delayMs)` on the stub API that
  [`startStubAPI`](../../../../apps/web/src/test-utils/start-stub-api.ts) returns. Pass the
  request's URL path with no query string, such as `/rpc/passkeys/list`, and about 500 ms. The delay
  holds for every request to that path until the stub API stops. Read the control's
  `getBoundingClientRect().top` when the control first appears, read it again once the data shows,
  and expect the same value. Without the delay, the data can arrive before the first paint, and the
  test passes whether the control moves or not.
- **Undo in `onTestFinished` each change your suite makes to `globalThis`, such as a stubbed
  `fetch`.** The next file runs in the same process, and the root preloads reset only what they set
  up.
- **Only when a suite spawns its own Chrome process, give that process a `TMPDIR` folder directly
  under `/tmp`, 50 bytes or fewer.** No suite does this today, and no helper exists: rig picks the
  lane's own short `TMPDIR` and exports nothing for it. Chrome stops at startup when the path
  `<TMPDIR>/org.chromium.Chromium.XXXXXX/SingletonSocket` passes 107 bytes, and 50 bytes leaves room
  for that path.

## Write a suite

Start from an existing suite, such as
[`memory.browser.test.ts`](../../../../apps/web/src/routes/memory.browser.test.ts), and copy its
`setupTest()`. That function serves the web build with the helpers in
[`test-utils/`](../../../../apps/web/src/test-utils/):

- [`startStubAPI()`](../../../../apps/web/src/test-utils/start-stub-api.ts) starts the stub API.
- [`startBuiltWeb(api.url)`](../../../../apps/web/src/test-utils/start-built-web.ts) serves the web
  build against that API.
- [`startFrontProxy({ apiURL, webURL })`](../../../../apps/web/src/test-utils/start-front-proxy.ts)
  puts one URL in front of both. The suite navigates its view to that URL.
- [`setupSignedInBrowser(view, { appURL, token })`](../../../../apps/web/src/test-utils/setup-signed-in-browser.ts)
  signs the view in.

1. In `setupTest()`, open the view with `new Bun.WebView({ backend: 'chrome' })`, and close it in
   `onTestFinished`.
2. Still in `setupTest()`, navigate the view to `about:blank`, then clear the cookies with
   `view.cdp('Network.clearBrowserCookies')`. Bun sets up the CDP session on the first navigation,
   so a view must navigate once before `view.cdp` works.
3. Run code in the page through `runInPage(view, pageFunction, argument, schema)` from
   `@zgeoff/rig`. `pageFunction` is an arrow function that sees only `argument` and the page's
   globals, and `schema` is a zod schema for its result. Keep `view.evaluate` for a one-line
   expression.
4. Click with `view.click`, which clicks the way a user does. Before each click, wait for the page's
   fetched data. [Traps](#traps) gives the reason.
5. To test a viewport size, call
   `view.cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })`.
   Register an `onTestFinished` that calls `view.cdp('Emulation.clearDeviceMetricsOverride')` before
   the `onTestFinished` that closes the view, because hooks run in the order registered.
   [`app-shell.browser.test.ts`](../../../../apps/web/src/components/app-shell.browser.test.ts) does
   this.
