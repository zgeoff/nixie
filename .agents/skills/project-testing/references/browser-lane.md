# The browser lane

Run the web app's browser suites with `bun run test:browser` or `bun run test:journeys`, and write
each suite with the rules below. A browser suite is a `*.browser.test.ts` file that drives a
headless Chrome or Chromium through `Bun.WebView`. The browser lane is the pair of commands that run
these suites, and the setup they share. Watch for these traps:

- a suite started outside the lane has no web build;
- Bun finds no Chrome or Chromium to start on your host;
- the start options you pass to a view, such as its size, never reach Chrome;
- cookies and globals that one test or file leaves for the next;
- a click that misses because the page moved;
- a layout test that passes because the data arrived too early;
- text typed into a control, or a click on it, before React hydrates the page;
- a child Chrome whose `TMPDIR` path is too long.

[Traps](#traps) gives each trap and what to do. Jump there, to [Write a suite](#write-a-suite), or
to [How the lane runs](#how-the-lane-runs).

## How the lane runs

rig, the test runner `@zgeoff/rig`, runs both commands:

- `bun run test:browser` runs every browser suite outside `apps/server/e2e/`. Add a file's path to
  run only that file, such as `bun run test:browser apps/web/src/routes/<name>.browser.test.ts`.
- `bun run test:journeys` runs the user journeys in `apps/server/e2e/`, as
  [Journeys](./e2e-and-restic-lanes.md#journeys) describes.

Name a new suite `<name>.browser.test.ts`, and put it next to the code it tests. The lane finds it
by that name.

Each command first runs the `build:browser` script, which builds the web client once, so run the
command again after you change the web client. The command then runs the suites one file after
another in one test process. Every file shares one Chrome and one global object:

- rig adds its browser preload, a module that Bun loads before any test file, to the lane's test
  command. The browser preload starts the one Chrome. It opens a first view, with the start options
  that rig sets for Chrome, then closes that view.
- Your suite opens views. A view is a `Bun.WebView`, one browser tab in the one Chrome.
- The root preloads, the `[test].preload` list in the root `bunfig.toml`, load before every
  `bun test` process. They set up and reset the globals they own, such as stubs, matchers and the
  mock server.

## Traps

- **Start a browser suite only through `bun run test:browser` or `bun run test:journeys`.**
  [`write-browser-build.ts`](../../../../apps/web/src/test-utils/write-browser-build.ts), the
  `build:browser` script, writes the web build to the folder that rig sets in
  `RIG_BROWSER_BUILD_DIR`. A suite reads the build through
  [`readBrowserBuild`](../../../../apps/web/src/test-utils/read-browser-build.ts), which throws when
  that variable is not set.
- **Change the Chrome version only in
  [`chrome-pin.json`](../../../../scripts/test-utils/chrome-pin.json), together with the
  `playwright-core` version, in a pull request of its own.** The browser tests depend on exact
  Chrome behaviour, so both lane commands run through
  [`run-with-pinned-chrome.ts`](../../../../scripts/test-utils/run-with-pinned-chrome.ts). On Linux
  on x64 the script downloads the pinned Chrome for Testing build, refuses a build whose SHA-256 or
  version differs from the pin, and sets `BUN_CHROME_PATH` to it. The computer and render guests run
  the Chrome that `playwright-core` installs, and
  `bun scripts/test-utils/check-playwright-chrome.ts` fails when that Chrome differs from the pin.
  Run both browser lanes after a change.
- **When the browser preload fails because Chrome did not start on another host, point Bun at a
  browser or let CI run the lane.** On such a host Bun starts the Chrome it finds on `PATH`, in a
  standard install location, or at `BUN_CHROME_PATH`. With no browser on the host, push the branch
  and read the `pr / test-browser` check, which runs `bun run test:browser`, and the `journeys`
  check, which runs `bun run test:journeys`.
- **Open every view with `new Bun.WebView({ backend: 'chrome' })`.** `backend: 'chrome'` picks
  Chrome as the view's engine. Pass no other option: Bun ignores the start options, such as the
  viewport size, of every view after the first view, which the browser preload opens. Set the
  viewport size with step 6 of [Write a suite](#write-a-suite).
- **Clear the cookies before each test, with step 3 of [Write a suite](#write-a-suite).** Every view
  shares the one Chrome's cookie jar, across files too.
- **Undo in `onTestFinished` each change your suite makes to `globalThis`, such as a stubbed
  `fetch`.** The next file runs in the same process, and the root preloads reset only the globals
  they own.
- **Before each click, wait with
  [`waitForPage`](../../../../apps/web/src/test-utils/wait-for-page.ts) until the page shows the
  data it fetches in the browser.** When the data arrives, React renders the list, and the list
  pushes down every element below it. `view.click` measures where its target is, then clicks at that
  point a moment later. A move between the two sends the click to another element.
  - Pass `waitForPage(view, expression)` a JavaScript expression as a string. The helper evaluates
    the expression in the page until it returns exactly `true`. After 5 seconds, or the `timeoutMs`
    you pass, it throws an error that quotes the expression.
  - Write the expression as a check that returns `true` or `false`, such as
    `document.querySelector('ul li') !== null` for a list row, or
    `document.body.innerText.includes('Nothing here yet')` for the empty-list text. An expression
    that returns the text itself never counts as `true`.
  - When the page fetches no data in the browser, wait for the enabled control, as the next trap
    says.
- **Before you type into or click a control that the server sends in the page's HTML, wait until the
  control is enabled.** The server's HTML contains every control that needs no data from the
  browser. On a page whose route `loader` reads the page's data, such as the passkeys page, the
  server's HTML contains every control. Text typed into such a control before React hydrates the
  page is lost, and so is a click.
  - In the component, keep the control `disabled` until
    [`useIsHydrated()`](../../../../apps/web/src/conversation/use-is-hydrated.ts) returns true.
    Import the hook from where it is. When the component does not disable the control yet, add the
    `disabled` in your PR. A user who types early loses the text too.
  - In the test, wait with `waitForPage` for the enabled control, such as
    `document.querySelector('textarea:enabled') !== null` or `button[type=submit]:enabled`. On a
    page whose route `loader` reads the page's data, the data arrives with the HTML, so the enabled
    control is the only wait you need.
  - Only this wait shows that the page hydrated. React sets `_reactListening` on `document` before
    it hydrates the page's components.
- **To check that a control does not move when the page's data arrives, delay the stub API's answer
  to that data's request.** Without the delay, the data can arrive before the first paint, and the
  test passes whether the control moves or not. On a page whose route `loader` reads the data, such
  as the passkeys page, the delay holds back the server's HTML, and the test checks that the control
  does not move after the first paint.
  [`passkeys.browser.test.ts`](../../../../apps/web/src/routes/passkeys.browser.test.ts) does this:
  1. Before you navigate to the page under test, call `delayPath(path, delayMs)` on the stub API
     that [`startStubAPI`](../../../../apps/web/src/test-utils/start-stub-api.ts) returns. Pass the
     request's URL path with no query string, such as `/rpc/passkeys/list`, and about 500 ms. The
     delay holds for every request to that path until the stub API stops.
  2. Navigate, then wait with `waitForPage` until the control exists.
  3. Read the control's `getBoundingClientRect().top` with `view.evaluate`.
  4. Wait with `waitForPage` until the data shows, read `top` again, and expect the same value.
- **When a suite starts a child process that launches its own Chrome, such as a child `bun test`
  process with the browser preload, give the child a `TMPDIR` folder directly under `/tmp`, 50 bytes
  or fewer.** Chrome stops at startup when the path
  `<TMPDIR>/org.chromium.Chromium.XXXXXX/SingletonSocket` passes 107 bytes, and 50 bytes leaves room
  for that path. rig never picks this folder for your child. Make it with `mkdtemp` and a short
  prefix, and remove it in `onTestFinished`.

## Write a suite

Copy `setupTest()` from an existing suite, such as
[`memory.browser.test.ts`](../../../../apps/web/src/routes/memory.browser.test.ts). Each test calls
`setupTest()` first, so every test gets a fresh stub API, web server, proxy and view. Check that the
copied function does steps 1 to 3, which it does with the helpers in
[`test-utils/`](../../../../apps/web/src/test-utils/). Each helper stops what it started in its own
`onTestFinished`.

1. In `setupTest()`, serve the web build: call `startStubAPI()`, then `startBuiltWeb(api.url)`, then
   `startFrontProxy({ apiURL: api.url, webURL: web.url })`. The front proxy's URL is the app's URL.
2. Still in `setupTest()`, open the view with `new Bun.WebView({ backend: 'chrome' })`. Then
   register the `onTestFinished` hooks in this order. Hooks run in the order registered, and the
   viewport reset needs the view still open.
   - When the suite sets a viewport size, a hook that calls
     `view.cdp('Emulation.clearDeviceMetricsOverride')`.
   - A hook that closes the view.
3. Still in `setupTest()`, navigate the view to `about:blank`, then clear the cookies with
   `view.cdp('Network.clearBrowserCookies')`. Bun sets up a view's CDP session on its first
   navigation, and `view.cdp` works only after that.
4. In the test, when the page needs a session, create one with `store.sessions.create({})` from
   [`mocks/store.ts`](../../../../apps/web/src/mocks/store.ts), and pass its token to
   [`setupSignedInBrowser(view, { appURL, token })`](../../../../apps/web/src/test-utils/setup-signed-in-browser.ts).
   The helper sets the session cookie and navigates to the app's root. Then navigate to the page
   under test.
5. Run code in the page through `runInPage(view, pageFunction, argument, schema)` from
   `@zgeoff/rig`. `pageFunction` is an arrow function that sees only `argument` and the page's
   globals, and `schema` is a zod schema for its result. Keep `view.evaluate` for a one-line
   expression.
6. To test a viewport size, call
   `view.cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })`
   in the test, before you navigate to the page.
   [`app-shell.browser.test.ts`](../../../../apps/web/src/components/app-shell.browser.test.ts) does
   this, with the reset hook from step 2.
7. Click with `view.click`, which clicks the way a user does. Before each click or typed text, wait
   for the enabled control, and for the data the page fetches in the browser, as [Traps](#traps)
   says.
