# The hop gate of a fetch

nixie scans the URL of a web fetch for secrets, and a fetch can redirect to a URL that nixie never
saw. The fetcher follows redirects inside the fetch sandbox, and nixie's secrets and secret rules
never go there. The hop gate closes that gap: the fetcher asks the server before it follows each
redirect, on the open stream of the fetch, and waits for the server's go-ahead. The intended place
of the hop scan is the server, as this doc states it. The other places wait for your decision with
it. (open: hop scan place)

[The refusal of a URL that carries a secret](secret-url-refusal.md) owns what the scan matches and
the refusal sentences. It defines the finder, the function that returns the rule that a URL matches,
and the exemption, the function that lets some matched URLs through.
[The flow of a page fetch](page-fetch.md) defines the sent URL, the URL that the server sends to the
fetcher, and the second pass, a second fetch of one call.

The files in `sketches/web/` hold the TypeScript shapes, and a "Shape" or "Flow" line points at a
lettered section of one of those files. The [glossary](../../glossary.md) holds the terms that this
doc does not define. A rule that ends with `(open: <name>)` is the intended design and is not
settled: [the open list](open/web.md) holds the item of that name, with its options and its issue.

In this doc, "the server" is the nixie server, and "a host" is the host of a URL. The fetcher is the
program in the fetch sandbox that sends each request. It is a guest: a program that runs in a
sandbox. The fetch image is the sandbox image that holds the fetcher.

## Built

The code on the main branch does this. Every section after this one is design.

- The server's `readPage` is the function that `startFetchSandbox` returns. It takes a URL, starts
  one sandbox, sends one `FetchRequest`, and returns the `FetchReply` that it reads.
- A `FetchRequest` holds the URL, the limits and the denied ranges. The limits hold `redirects`, the
  most redirects that the fetcher follows.
- The fetcher follows redirects itself. Its own `readPage`, in the fetch guest, counts each redirect
  and calls `planHop` for the next URL. `planHop` resolves the host and checks its address.
- The server sees the sent URL and the final URL of a fetch, and no URL between them.
- The decoder of a request and the decoder of a reply each ignore a field that the decoder does not
  know.
- The server talks to the fetcher over an `ExecStream`. Its `send` writes one frame and does not
  close the fetcher's input, so a stream can carry several frames each way. The conversation guest
  uses a stream that way.
- The fetcher removes its temporary directory when a fetch ends.

## The terms

- **A hop** is one URL of a fetch. Hop 0 is the sent URL, hop 1 is the URL of the first redirect,
  and each redirect adds 1.
- **The hop gate** is the exchange in which the fetcher asks the server before each hop after hop 0.
- **A gated fetch** is a fetch whose request holds `hops: 'ask'`.

## The frames

Shape: [the request on the wire](sketches/web/02-types.ts), section D,
[the hop frames](sketches/web/02-types.ts), section E, and
[the reply on the wire](sketches/web/02-types.ts), section C.

- The `FetchRequest` type holds `hops`, which is `ask` or `none`. `hops` is a field of the type
  only: the encoder writes no `hops` field.
- For `hops: 'none'`, the encoder writes the same bytes as the encoder on the main branch.
- For `hops: 'ask'`, the encoder writes 0 as `limits.redirects`, and the real redirect limit as
  `hopGate.redirects`. The decoder reads `hopGate.redirects` as the redirect limit when the frame
  holds `hopGate`, and decodes the request as `hops: 'ask'`.
- Only the encoder and the decoder read or write `hopGate`. The decoded request holds the real
  redirect limit in `limits.redirects`, and other code reads `hops` and `limits.redirects`.
- A fetcher whose decoder does not know `hopGate` ignores it and reads a redirect limit of 0. Such a
  fetcher never follows a redirect, so it never follows a hop that the server did not scan.
- The fetcher sends a `hop` frame with the hop's URL, and the server sends back a `hop-pass` frame.
  The server never sends a refusal frame: it stops the fetcher.
- Each of the 4 kinds of `FetchReply` holds `isGated`, true when the fetcher asked before each hop.
  The decoder reads a missing field as false.

## The fetcher's half

`makeHopAsker` of the wire lib writes the `hop` frame, resolves on the `hop-pass` frame, and rejects
on an abort or when the fetcher's input closes. Flow:
[the fetcher's redirect loop](sketches/web/03-flow.ts), section G.

- The fetcher asks after it counts the redirect and before `planHop`. So it never resolves the host
  name of a hop that the server has not passed, and never opens a connection to it.
- `makeHopAsker` imports nothing from the fetcher, so another guest can use it.

## The server's half

The connectors module owns 2 functions. `makeHopScan` builds the `scanHop` function, which decides
on one hop. `gatePageHops` reads the frames of one gated fetch from its `ExecStream`, and calls
`scanHop` for each `hop` frame. Shape:
[the hop types and the 2 functions](sketches/web/02-types.ts), section F. Flow:
[the states of a gated fetch](sketches/web/03-flow.ts), section G.

- The server's `readPage` takes an optional `scanHop`. A call with a `scanHop` sends `hops: 'ask'`,
  and a call without one sends `hops: 'none'`.
- `runPageFetch` of the web fetch tool always passes a `scanHop`, so every fetch of the tool is a
  gated fetch. The first fetch and the second fetch of one tool call use the same exemption.
- `scanHop` runs the same finder as the scan of the sent URL. On a match, it calls the exemption,
  passes the hop when the exemption returns true, and refuses the hop otherwise.
- The server takes one thing from a `hop` frame: the hop's URL. It counts the hops itself. For the
  refusal sentence, it takes the host that sent the redirect from the URL of the hop before.
- `gatePageHops` imports nothing from the fetcher, so another sandbox starter can use it.

A gated fetch has 5 states on the server:

| State      | What arrives        | Next state | What the server does                    |
| ---------- | ------------------- | ---------- | --------------------------------------- |
| `reading`  | a `hop` frame       | `scanning` | counts the hop and runs `scanHop`       |
| `scanning` | a pass of `scanHop` | `reading`  | sends `hop-pass`                        |
| `scanning` | a refusal           | `stopped`  | stops the fetcher and returns `refused` |
| `reading`  | the reply frame     | `replied`  | returns the reply                       |
| any state  | a fault             | `failed`   | stops the fetcher and returns `failed`  |

A fault is one of 6:

- `scanHop` throws;
- the fetcher sends more `hop` frames than the redirect limit;
- the fetcher sends a `hop` frame on a fetch that the server sent with `hops: 'none'`, which
  `readPage` reads through the same code;
- a frame from the fetcher does not decode;
- the fetcher's output closes before a reply frame;
- the fetch passes its time limit.

The rules:

- The server handles one frame of a fetch at a time: the fetcher waits while `scanHop` runs.
- The fetch has one time limit, which covers each scan.
- A `refused` reply for a hop holds the hop's refusal sentence, which
  [the refusal](secret-url-refusal.md#the-refusal) owns.
- When the server stops the fetcher, the fetcher's own cleanup does not run. The server destroys the
  sandbox, which removes the fetcher's temporary directory.
- A redirect costs one frame each way on the open stream of the fetch, and one scan on the server.
  The server never starts a sandbox for a hop. A fetch with no redirect pays nothing.
- A fetch image of a release without the hop gate reads a redirect limit of 0 and fails a page that
  redirects. The server detects that case: a `failed` reply with `isGated: false` to a request that
  it sent with `hops: 'ask'` and a real redirect limit above 0. It replaces the reply's reason with
  one that gives the cause: the fetch image is of a release before the server's. Every failure of
  such a fetch image on such a request gets that reason. (open: image release reason)

## The skill file reader

The skill file reader fetches the files of a skill through a `readPage` of its own, which a second
`startFetchSandbox` call returns. A wrapper function sits in front of that `readPage`, and
[What the server wires](secret-url-refusal.md#what-the-server-wires) owns the wrapper.

- The wrapper passes a `scanHop` to that `readPage`, so the skill file reader's fetches are gated
  fetches. Its exemption lets nothing through.
- When the config key `secret_scan_skill_files` is false, the wrapper passes no `scanHop`, and the
  server never scans a hop of the skill file reader. (open: skill file scan)

## Not in scope

- A page reader that runs a headless browser. `makeHopAsker` and `gatePageHops` import nothing from
  the fetcher, so the browser's guest and the browser's sandbox starter can call them with the same
  `scanHop`. The design of that reader owns its limit on navigations. It owns the case of a browser
  whose first request goes to a URL that is not the sent URL, character for character.
- A scan inside the sandbox, and a sandbox for each hop.
- A check of whether a hop's host is paused:
  [the pause per host](page-fetch-pause-and-cache.md#the-pause).
