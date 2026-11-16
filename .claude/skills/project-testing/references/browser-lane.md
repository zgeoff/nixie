# The browser lane

Write, run and debug the web app's browser suites with the rules below. A browser suite is a
`*.browser.test.ts` file. It drives a headless Chrome or Chromium through `Bun.WebView`, and each
`Bun.WebView` it opens, a view, is one browser tab. Watch for a suite started outside the lane, a
view option that never reaches Chrome, state that one file leaves for the next, and a click that
misses because the page moved.

Jump to [Traps](#traps), for each trap and what to do, or to [Write a suite](#write-a-suite).

Name a new suite `<name>.browser.test.ts`, and put it next to the code it tests. rig, the test
runner `@zgeoff/rig`, runs the lane and picks up every such file:

- `bun run test:browser` runs every browser suite outside the root `e2e/` folder.
- `bun run test:journeys` runs the user journeys in the root `e2e/journeys/` folder, as
  [Journeys](./e2e-and-restic-lanes.md#journeys) describes.

Each command first runs the `build:browser` script, which builds the web client. It then runs the
suites one file after another in one test process. Run the command again after you change the web
client: each command builds the client once, when it starts.

Bun loads each preload module before any test file. The lane runs 2 sets of them:

- rig adds its browser preload to the lane's test command. The browser preload starts the one Chrome
  for the process: it opens a view with Chrome's start options, then closes it. Your suite opens its
  own views.
- The root preloads, the `[test].preload` list in the root `bunfig.toml`, run in every `bun test`
  run. They set up and reset globals, such as stubs, matchers and the mock server.

## Traps

- **Start a browser suite only through `bun run test:browser` or `bun run test:journeys`.**
  [`write-browser-build.ts`](../../../../apps/web/src/test-utils/write-browser-build.ts), the
  `build:browser` script, writes the web build to the folder that rig sets in
  `RIG_BROWSER_BUILD_DIR`. A suite reads the build through
  [`readBrowserBuild`](../../../../apps/web/src/test-utils/read-browser-build.ts), which throws when
  that variable is not set.
- **When the browser preload fails because Chrome did not start, point Bun at a browser or let CI
  run the lane.** Bun looks for Chrome or Chromium on `PATH`, in a standard install location, and at
  `BUN_CHROME_PATH`. Set `BUN_CHROME_PATH` when the browser is installed somewhere else. With no
  browser on the host, push the branch and read the `pr / test-browser` check, which runs
  `bun run test:browser`, and the `journeys` check, which runs `bun run test:journeys`.
- **Open every view with `new Bun.WebView({ backend: 'chrome' })`.** `backend: 'chrome'` picks
  Chrome as the view's engine. Pass no other option. The one Chrome starts with the options of the
  browser preload's view, and Bun ignores the options of each later view. So a view's options cannot
  set the viewport size. Set it with step 6 of [Write a suite](#write-a-suite).
- **Clear the cookies before each test.** Every view shares the one Chrome's cookie jar, across
  files too.
- **Before each click, wait with
  [`waitForPage`](../../../../apps/web/src/test-utils/wait-for-page.ts) until the page shows the
  data it fetches in the browser.** When the data arrives, React renders the list, and the list
  pushes down every element below it. `view.click` measures where its target is, then clicks at that
  point a moment later. A move between the two sends the click to another element.
  - Pass `waitForPage(view, expression)` a JavaScript expression as a string. The helper evaluates
    the expression in the page until it returns exactly `true`.
  - Write the expression as a check that returns `true` or `false`, such as
    `document.querySelector('ul li') !== null` for a list row, or
    `document.body.innerText.includes('Nothing here yet')` for the empty-list text. An expression
    that returns the text itself never counts as `true`.
  - When the page fetches no data, wait for the click target to exist.
  - React renders fetched data only after hydration, so this wait also shows that the page hydrated.
    Don't check `_reactListening` on `document` for hydration: React sets that key before it
    hydrates the page's components.
- **To check that a control does not move when the page's data arrives, delay the stub API's answer
  to that data's request.** Without the delay, the data can arrive before the first paint, and the
  test passes whether the control moves or not.
  [`passkeys.browser.test.ts`](../../../../apps/web/src/routes/passkeys.browser.test.ts) does this:
  1. Before you navigate, call `delayPath(path, delayMs)` on the stub API that
     [`startStubAPI`](../../../../apps/web/src/test-utils/start-stub-api.ts) returns. Pass the
     request's URL path with no query string, such as `/rpc/passkeys/list`, and about 500 ms. The
     delay holds for every request to that path until the stub API stops.
  2. Navigate, then wait with `waitForPage` until the control exists.
  3. Read the control's `getBoundingClientRect().top` with `view.evaluate`.
  4. Wait with `waitForPage` until the data shows, read `top` again, and expect the same value.
- **Undo in `onTestFinished` each change your suite makes to `globalThis`, such as a stubbed
  `fetch`.** The next file runs in the same process, and the root preloads reset only what they set
  up.
- **When a suite spawns its own Chrome process, give that process a `TMPDIR` folder directly under
  `/tmp`, 50 bytes or fewer.** Chrome stops at startup when the path
  `<TMPDIR>/org.chromium.Chromium.XXXXXX/SingletonSocket` passes 107 bytes, and 50 bytes leaves room
  for that path. rig picks a short `TMPDIR` for the lane's own test process, and `@zgeoff/rig`
  exports no function that picks one for your process.

## Write a suite

Copy `setupTest()` from an existing suite, such as
[`memory.browser.test.ts`](../../../../apps/web/src/routes/memory.browser.test.ts). It already does
steps 1 to 3 with the helpers in [`test-utils/`](../../../../apps/web/src/test-utils/). Keep those
steps in this order, and add the rest.

1. In `setupTest()`, serve the web build: call `startStubAPI()`, then `startBuiltWeb(api.url)`, then
   `startFrontProxy({ apiURL: api.url, webURL: web.url })`. The front proxy's URL is the app's URL.
2. Still in `setupTest()`, open the view with `new Bun.WebView({ backend: 'chrome' })`, and close it
   in `onTestFinished`.
3. Still in `setupTest()`, navigate the view to `about:blank`, then clear the cookies with
   `view.cdp('Network.clearBrowserCookies')`. Bun sets up a view's CDP session on its first
   navigation, and `view.cdp` works only after that.
4. In the test, when the page needs a session, call `setupSignedInBrowser(view, { appURL, token })`.
   It sets the session cookie and navigates to the app's root. Then navigate to the page under test.
5. Run code in the page through `runInPage(view, pageFunction, argument, schema)` from
   `@zgeoff/rig`. `pageFunction` is an arrow function that sees only `argument` and the page's
   globals, and `schema` is a zod schema for its result. Keep `view.evaluate` for a one-line
   expression.
6. To test a viewport size, call
   `view.cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })`.
   In `setupTest()`, register an `onTestFinished` that calls
   `view.cdp('Emulation.clearDeviceMetricsOverride')` before the `onTestFinished` that closes the
   view. Hooks run in the order registered.
   [`app-shell.browser.test.ts`](../../../../apps/web/src/components/app-shell.browser.test.ts) does
   this.
7. Click with `view.click`, which clicks the way a user does. Before each click, wait for the page's
   fetched data. [Traps](#traps) gives the reason.
