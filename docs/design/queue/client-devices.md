# Client devices

- **Status:** draft
- **Work items:** [client devices](https://linear.app/zgeoff/issue/GEO-2872)

Every signed-in browser is a device from its first sign-in, so the assistant can show something on
the screen you're using. A device belongs to a client, one signed-in browser and its session cookie,
so ten tabs of one browser are one device. On a call, the assistant keeps its spoken reply short and
puts a long answer on a screen. It says "let me put that together", shows the week on the call's
device, and says "I've put that on your screen". You open that screen in the app and go back to the
call, which stays live the whole time. A real GPT-Live session summarised or cut short a
2,400-character answer in 3 of 3 tries, and short answers worked every time.

This design adds no call machinery. The call's turn already gets the conversation's tools, the
device tools among them, and its own voice-call prompt. Build it from this doc, the
[devices architecture](../../architecture/channels/devices.md) and the
[calls architecture](../../architecture/channels/calls.md).

## Shape

```mermaid
flowchart LR
  signin[browser sign-in] -->|"writes the device row"| device[client device]
  call[call turn] -->|"devices.list: onCall"| device
  call -->|"device.region / device.show"| device
  app[web client] -->|"call bar on every route"| view[device view]
  view --> device
```

## Contracts

```ts
// sessions module. A sign-in that makes a full session with cookie delivery writes the session's
// device row in the same write transaction, named with the session's deviceName.
await sessions.enrol({
  clientActionID,
  code,
  deviceName: 'Kitchen laptop',
  tokenDelivery: 'cookie',
});
// → { scope: 'full', sessionID: '9c1e…' }   and a devices row { shortID: 'd4k2', kind: 'client' }
```

```ts
// devices module. devices.list gains two fields per device.
interface DeviceListEntry {
  // …existing fields
  kind: 'client' | 'screen'; // client: a browser's own device; screen: one enrolled with a device code
  onCall: boolean; // true only while this device's session carries a call in the live state
}
```

```text
voice-call prompt (calls module), one added rule:
  Keep a spoken reply to about 3 sentences. When the answer is longer, such as a list or a plan,
  put it on a device with the device tools, then say where it is. The call's device is the one
  devices.list marks onCall. Showing anything is your choice each time.
```

```tsx
// web client. The call lives above the router, so a route change never ends it.
<CallProvider>
  {' '}
  {/* holds the peer connection, the microphone and the call's live stream */}
  <CallBar /> {/* on every route while a call is live: time, mute, hang up, back to the call */}
  <Router /> {/* the call screen, the chat and the device view are routes under it */}
</CallProvider>
```

## Constraints

- Every sign-in that makes a full session with cookie delivery writes its device row, a passkey
  sign-in included. A session with bearer delivery is a program, and gets no device row.
- A full session holds one device row from sign-in until its sign-out or revoke, which removes the
  row as today. `devices.register` renames the row.
- An existing full cookie session with no row gets one at its next authenticated request, written
  once.
- A client device starts with the screen on. A screen device keeps today's rule: the screen stays
  off until the device switches it on.
- A client device is online while any of its tabs has the device view open. A show to it while it is
  offline waits, as for any device, and appears when you open the device view.
- At most one device has `onCall` true at a time, and only while its session carries a call in the
  `live` state. It turns false when the call ends or drops, and moves when the call reconnects on
  another session.
- No tool takes "the call's device" as a target. The assistant passes the device's short ID, which
  it reads from `devices.list`.
- The device view in the app shows the client's own device at the size of the page's content area,
  and reports that size through `devices.resize`.
- Opening the device view, the chat or the call screen during a call keeps the call's audio, its
  microphone grant and its live stream. Only a hang-up, a call end or a sign-out ends the call.
- While a call is live, the call bar shows on every route, and one tap opens the call screen.
- The full-screen device mode at `/device` stays as it is, for a screen device.

## Builder decides

- Where the device view sits in the app's navigation, and its icon.
- The call bar's layout.
- Whether the row for an existing session comes from a request hook or a lazy write in the device
  calls.

## Open questions

- Whether a client device's screen starts on. On lets the assistant show on any browser you are
  signed in on, which only you see, and only while the device view is open. Until the owner chooses,
  it starts on.

## Out of scope

- The call screen's own layout: [the call screen](https://linear.app/zgeoff/issue/GEO-2863).
- Ringing a device, and voice tuning.
- A camera or a microphone on a client device.
