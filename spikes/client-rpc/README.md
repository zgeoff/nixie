# Spike: a typed API with a live stream on Bun

This spike serves one oRPC contract from Bun, over HTTP through Elysia and over a WebSocket on
`Bun.serve`, and calls it from a typed client. It checks the 3 shapes the client needs: a plain
call, a checked action that fails on a stale action hash, and a stream that follows the event log by
sequence and resumes after a dropped connection.

- Bun 1.4.2, TypeScript 7.0.2
- `@orpc/server`, `@orpc/client` and `@orpc/contract` 1.15.5, `elysia` 1.4.30, `zod` 4.6.5

## Question

Does one typed contract on Bun carry calls, checked actions and a resumable live stream, how much
setup does it take, and can the same contract serve the web client and an Expo app?

## Run it

Run each command from this directory.

```bash
bun install
bun run.ts
bun run typecheck
bun build client-entry.ts --target browser --minify --outfile /tmp/client.js
```

- [contract.ts](./contract.ts) holds the contract: `conversation.send` with a client message ID and
  paste spans, `approvals.approve` with the proposal ID and the action hash the client rendered, and
  `log.follow`, an event iterator whose event ID is the log sequence.
- [server.ts](./server.ts) implements the contract once, checks a session token in a middleware, and
  mounts the handler on Elysia at `/rpc*` and on a `Bun.serve` WebSocket.
- [run.ts](./run.ts) runs the checks over both transports, then restarts the HTTP server in the
  middle of a stream.
- [typecheck.ts](./typecheck.ts) holds calls that must fail to compile.

## Answer

One contract carries all 3 shapes over both transports, and the client stays typed end to end:

```text
fetch send: first={"duplicate":false,"sequence":1} resend={"duplicate":true,"sequence":1}
fetch approve with a stale hash: defined=true code=CONFLICT
ws send: first={"duplicate":false,"sequence":2} resend={"duplicate":true,"sequence":2}
ws approve with a stale hash: defined=true code=CONFLICT
fetch wrong session: code=UNAUTHORIZED
ws wrong session: code=UNAUTHORIZED
fetch append to client: n=200 median=0.20ms p95=1.90ms
ws append to client: n=200 median=0.14ms p95=0.24ms
fetch override called 5 times
fetch resume across a server restart: received=30 missing=0 duplicates=0
```

- **Checked actions.** The `CONFLICT` error is declared in the contract, so the client receives it
  as a typed, defined error and can tell a stale action hash from a network fault.
- **Idempotent sends.** A resend with the same client message ID returns the first sequence and
  appends nothing, so a client on a flaky network can retry a send safely.
- **The live stream.** A record reaches the client in under 1 ms on loopback over either transport.
  The figure measures oRPC and the transport, not a network.
- **Resume.** With `ClientRetryPlugin` and an infinite retry on `log.follow`, the client reconnected
  after the server restarted, sent the last event ID, and received every record appended while the
  server was down, with no gap and no duplicate. The handler reads `lastEventId` and continues from
  that sequence, which is the follow-by-sequence model of the event log design.
- **Types.** `tsc` from TypeScript 7.0.2 checks the spike in about 0.1 s, and rejects an approve
  without its action hash, a span source outside the enum, and a misuse of a typed output.
- **Setup.** The contract, both server transports, the auth middleware and the checks come to about
  390 lines, most of them checks. `bun install` took 3 s for 39 packages. The one adapter step is
  Elysia's `parse: 'none'`, which leaves the body to oRPC.
- **Bundle.** A browser bundle of the client, the fetch link, the retry plugin and the contract
  types is 23.8 KB minified and 8.7 KB gzipped. It holds no zod and no Elysia, because the client
  imports the contract only as types.

### Expo

The fetch link takes a `fetch` override, which the run exercised. oRPC documents Expo as supported:
Expo installs the Web Streams that oRPC needs from SDK 53, and from SDK 56 `expo/fetch`, which
streams response bodies, replaces React Native's global `fetch`
([oRPC Expo adapter](https://orpc.dev/docs/adapters/expo)). The current Expo SDK is 57. On SDK 53 to
55, the app passes `expo/fetch` to the link through the override. React Native's own `fetch` has no
response body, so the event iterator cannot work on it.

The WebSocket link in 1.15.5 takes one open socket and does not reconnect by itself, while the fetch
link resumes through the retry plugin. A browser WebSocket cannot set headers, so the spike sends
the session in the subprotocol list, which the server echoes.

## Untested

- The same client inside an Expo app on a device or emulator, with `expo/fetch` streaming the event
  iterator over a mobile network.
- A reconnecting WebSocket, and a stream held open across a phone going to sleep.
- tRPC 11 and Elysia's Eden, the alternatives for a typed API on Bun.
- The client against a real network with latency and a TLS proxy in front.
- Cookie sessions and CSRF, in place of the bearer token the spike uses.
