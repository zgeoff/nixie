# Devices

- **Status:** draft
- **Work items:** [the assistant uses your devices](https://linear.app/zgeoff/issue/GEO-2758), with
  [the notebook](https://linear.app/zgeoff/issue/GEO-2726) for the pages a screen shows

[Devices](../../architecture/channels/devices.md) built the screen: enrolment, the scoped session,
the stream, and the tools that show markdown and images. What is left is the camera, the speaker,
the microphone, and a notebook page on a screen. A device record already holds a capability for each
of the first three, and each stays off.

## Contracts

### The camera

```ts
device.look({ device: 'tb8r3k6m1q' });
// → { device: 'tb8r3k6m1q', at: '2026-11-21T09:02:11Z', width: 1280, height: 720 } with the still beside it
//   or { refused: 'CAMERA_OFF' } | { refused: 'OFFLINE' } | { refused: 'UNKNOWN_DEVICE' }
//   or { refused: 'NO_NOTICE' } when the screen is off, because a look must show its notice
//   or { refused: 'IMAGE_CAPS_FULL' }, checked before the device takes a still

// device.look declares ['sense'], a new effect for reading a room, with the device as destination.
//   It runs direct when a rule allows it and queues when it asks. Its risk class is routine, so its
//   card offers "always allow" for that device. Your starter rules hold no rule for it.

// contract lib: the device stream gains an event, and a device session gains a call
// devices.follow yields … | { kind: 'look'; lookID: string }   // take one still now
devices.sendStill({ lookID, still: Uint8Array }); // a JPEG, at most 2 MiB
devices.sendStill({ lookID, refused: 'denied' | 'no_camera' }); // the tool returns CAMERA_OFF
// the server makes each lookID with crypto.randomUUID() and sends the look event to the newest open
// stream only. The first answer wins; a later one, or one after 10 seconds, is refused
```

`devices.setCapability` takes `camera`, `speaker` and `microphone` as well, and the device session's
allowed calls gain `devices.sendStill`.

```text
device.looked                  -- one per look that returns a still; the still is its attachment
```

### A notebook page on a screen

```ts
type ScreenContent = … | { kind: 'page'; page: string }; // a notebook page's short ID
// device.show refuses UNKNOWN_PAGE for every page until the notebook's build, then PAGE_FORGOTTEN too
// devices.list: showing gains { kind: 'page', page, until }
```

## Constraints

- A capability switches on only from the device itself. No tool and no other device can switch one
  on, so whoever sets up each device decides whether its camera works.
- A look takes one still. The device never streams or records video, and no tool asks for more than
  one still per call.
- While a look runs, the device's screen shows a bright border and the words "Nix is looking", for
  at least 3 seconds.
- The browser's own camera permission stays on the device. The device asks for it when you switch
  the camera on, and a look fails with `CAMERA_OFF` when the browser refuses.
- The still goes beside the result, fitted and counted against the session's image caps like a
  fetched image, and into the `device.looked` record's sealed attachments, so a forget erases it. It
  never becomes an image the assistant can edit, import or send.
- A look that gets no answer within 10 seconds of the look event returns `OFFLINE`.
- `device.look` checks in this order and returns the first refusal: `UNKNOWN_DEVICE`, `CAMERA_OFF`,
  `NO_NOTICE`, `IMAGE_CAPS_FULL`, then `OFFLINE`.
- The speaker and the microphone come with their own work items.
- When a page is forgotten while it shows, the server sends the idle event.

## Decisions

- **Looking has its own effect.** A still from a shared room is private to everyone in it, so your
  rules can treat looking apart from every other read.

## Out of scope

- Taps on a screen that come back to the assistant as events.
- HTML content on a screen.
- The speaker and microphone tools.
- Dimming a screen on a schedule. The assistant sets an empty scene at night.
