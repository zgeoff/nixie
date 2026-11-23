# The desktop and take-over

- **Status:** draft

The assistant's browser and shell become one computer: a virtual desktop with Chromium and a
terminal on one disk. You can watch that desktop live in the web client and take it over with your
own mouse and keyboard, and the assistant can ask you to take over when it meets a CAPTCHA, a bank
check or a page that wants a person. The assistant keeps its page tools and gains tools for the
whole screen, so it can scroll and reach what the page tools can't.

## Shape

```mermaid
flowchart LR
  model[assistant] -->|"computer.*"| point[decision point]
  point --> tools[computer tools]
  tools -->|"frames"| desktop[desktop sandbox]
  desktop --> proxy[checking proxy] --> web[sites]
  desktop -->|"screen"| relay[screen relay]
  relay <-->|"live view, input"| client[web client]
```

The desktop sandbox runs a virtual display, a window manager, headed Chromium on the browser
profile, a terminal on the files folder, and a VNC server on the display. The server relays the VNC
stream to the web client over a WebSocket, and drops your input unless you hold the desktop.

## Contracts

### The tools

Every tool keeps the `computer.` namespace. The 7 built browser tools gain the `browser_` prefix and
keep their inputs, results, effects and refusals, except where the sketch below shows a change.
`computer.run` and the file tools keep their names.

| Tool                                                     | Status                                              | Runs           |
| -------------------------------------------------------- | --------------------------------------------------- | -------------- |
| `computer.browser_open`, `_read`, `_click`, `_fill`      | renamed from `computer.open` etc.                   | as today       |
| `computer.browser_close`, `_download`                    | renamed                                             | as today       |
| `computer.browser_screenshot`                            | renamed from `computer.screenshot`, gains `control` | direct, `note` |
| `computer.browser_scroll`                                | new                                                 | direct, `note` |
| `computer.screenshot`, `computer.screen_scroll`          | new                                                 | direct, `note` |
| `computer.screen_click`, `computer.screen_type`          | new                                                 | queued         |
| `computer.run`, `read_file`, `write_file`, `export_file` | unchanged                                           | as today       |

A direct call runs inside the turn when its rules allow it, and a queued call goes to the action
queue, as [reads and acts](../../architecture/connectors/computer.md#reads-and-acts) describes.

```ts
// connectors module
computer.browser_scroll({ tab: 't3', to: 'down' }); // to: 'up' | 'down' | a control such as 'E12'
// → { tab: 't3', isAtEnd: false } with the viewport's picture beside the result; no page is stored
//   refusals: TAB_GONE, STALE_ELEMENT

computer.browser_screenshot({ tab: 't3', control: 'E12' }); // control is optional
// → the control's box, or the viewport without one; STALE_ELEMENT for a control that moved

computer.screenshot({}); // the whole desktop
// → { width: 1280, height: 800, focus: { kind: 'browser', tab: 't3', url: 'https://…' }, isWatched: false }
//   isWatched: true while a device session has the live view open; every screenshot and screen act
//   result carries it
//   the picture sits beside the result at 1280 by 800, so its points are the ones a click takes
//   focus.kind: 'browser' | 'terminal' | 'other'

computer.screen_scroll({ x: 640, y: 400, by: 5 }); // by: wheel steps; negative scrolls up

computer.screen_click({ x: 412, y: 233, button: 'left' }); // button: 'left' | 'right'
// → { focus } with a picture beside it, or SCREEN_CHANGED

computer.screen_type({ text: 'hello' }); // exactly one of text (at most 1,000 characters) or keys
computer.screen_type({ keys: 'ctrl+l' }); // keys: one chord, such as 'enter' or 'shift+tab'
// → { focus } with a picture beside it, or SCREEN_CHANGED
```

```ts
// connectors module: each screen act binds to the window the assistant saw
interface ScreenBinding {
  windowID: string;
  kind: 'browser' | 'terminal' | 'other';
  tab?: string;
  url?: string;
  // read in the tool's prepare hook and held in memory, as expectURL is; the action hash covers
  // it, and the guest refuses with SCREEN_CHANGED when the focused window differs on any field
  // when the action runs. A restart between the call and the action makes it refuse.
}
```

### Effects

| Call                             | Effect | Destination            |
| -------------------------------- | ------ | ---------------------- |
| a screen act on a browser window | `send` | the focused tab's host |
| a screen act on another window   | `send` | none                   |

The card for a screen act shows its screenshot with the point marked, or the text or keys it types.
Its "always allow" pins the host alone, so one answer covers every later screen act on that site,
and a rule of yours that names the host covers them too.

A screen act on a terminal window returns `USE_RUN`, with the message "Use the computer.run tool
instead". A screen act on Chromium's address bar or tab strip, and a chord that focuses the address
bar, such as `ctrl+l`, returns `USE_BROWSER_OPEN`, with the message "Use the computer.browser_open
tool instead". The guest checks both against the focused window when the act runs.

### The push notice

A `computer.handover_asked` record also goes out as a [push notice](push-notice.md), so an ask
reaches you with no client open. Work:
[the Telegram push notifier](https://linear.app/zgeoff/issue/GEO-1812).

### The sandbox and its size

| Role     | Used by                 | vCPUs | Memory   | Disk      |
| -------- | ----------------------- | ----- | -------- | --------- |
| computer | the assistant's desktop | 2     | 1536 MiB | 24576 MiB |

The `computer` row replaces the `browser` and `shell` rows, and reserves what they reserved
together. The [desktop memory spike](../../../research/desktop-memory/) held a watched, scrolling
desktop in 1024 MiB with about 370 MiB spare, and the other 512 MiB is the shell row's room for
commands. One sandbox of kind `computer`, owned by `computer-desktop`, replaces the two. Its image
`nixie-computer` comes from `guests/computer`, which takes the place of `guests/browser` and
`guests/shell`.

## Constraints

The desktop:

- The display is 1280 by 800.
- Chromium runs headed on the display, with the existing profile and proxy settings.
- The guest scans every request Chromium makes, whether or not a tool call is running. The scan
  channel stays open for the guest's life, and a request made during a hold is scanned the same way.
- Every process that the terminal starts, and every `computer.run`, runs in a network namespace that
  holds a loopback and the bridge to the proxy alone, as each `computer.run` does today. The proxy
  refuses CONNECT from the namespace.
- The display listens on an abstract socket alone, which a separate network namespace can't reach,
  so no process in the namespace can drive Chromium or read the screen.
- The VNC server listens on loopback inside the sandbox, with its clipboard turned off, and no port
  of the sandbox is reachable from outside it.
- A tab that you or a page opens gets the next tab ID when the guest sees it, and every tab in a
  result has an ID.
- When the first call after the release finds the old browser and shell sandboxes, it copies the
  profile and the files folder into the new disk, then destroys the two. Until a copy succeeds,
  every computer tool returns `COMPUTER_MOVING`, and the next call tries again.
- The copy checks that the new disk holds the same file count and bytes as each old folder before it
  destroys the old sandboxes.
- The build updates each rule in the deployment's definitions that names an old tool. An action
  pending under an old name returns `TAB_GONE`, as any act on a replaced sandbox does.
- Chromium runs as one user and the terminal and every `computer.run` as another. The profile folder
  is readable by Chromium's user alone, and the two users can't trace or signal each other's
  processes. `browser_download` saves into the files folder for the terminal's user.
- The terminal's processes and every `computer.run` share a memory limit of 512 MiB, so a heavy
  command ends itself before it takes Chromium's memory.

Watching:

- Only a device session watches or takes over. A read-only token never does, because the screen can
  show a signed-in account.
- A `computer.watch` ticket opens one WebSocket within 30 seconds, is then spent, and never reaches
  a log.
- The relay drops every key, pointer and clipboard message from a client whose device session does
  not hold the desktop.
- Watching writes no record. The assistant learns of it only through `isWatched`, which turns true
  when a watch's WebSocket opens and false when the last one closes.
- A watch holds the sandbox awake, as a call does, and opening the view wakes a sleeping sandbox.
- nixie stores no frame of the stream.

## Decisions

- **One desktop holds the browser and the terminal.** You drive one computer, as a person uses one.
  The namespace around each terminal process and the display's abstract socket keep the shell's
  network rules inside that machine.
- **You watch through VNC.** It shows every window, the terminal included, where Chromium's own
  screen stream shows one tab.
- **The assistant knows when you watch, and watching leaves no record.** Knowing lets it narrate for
  you, as the notebook tells it when you read its notes. You hold the keys to everything it has, so
  a record would add nothing.
- **The assistant's page tools stay its main way in.** Page text costs far fewer tokens than a
  screenshot, and a control ID tells you what a click presses.
- **The assistant never drives the terminal window or the address bar.** nixie's rules read a
  command from `computer.run` and a site from `computer.browser_open`, and see only keystrokes in a
  window. The terminal window is yours when you take over.

## Builder decides

- The window manager, the terminal app, the VNC server and the web client's VNC viewer library,
  within the spike's measurements; the PR names each for the owner.
- How the relay reaches the VNC server through the sandbox runtime, and how the test build runs the
  guest without a display.
- The layout of the computer page in the web client, and where the handover banner sits.
- The wording of refusals and tool descriptions.
- How the work splits into PRs.

## Out of scope

- Audio from the desktop.
- Copy and paste between your machine and the desktop.
- Files dragged in from your machine.
- A desktop on a phone-sized screen.
