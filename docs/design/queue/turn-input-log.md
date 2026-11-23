# The turn-input log

- **Status:** draft
- **Work item:** [the ChatGPT plan login](https://linear.app/zgeoff/issue/GEO-2238)

The turn-input log is built, as [the turn-input log](../../architecture/policy/turn-input-log.md)
describes. One part remains: a Codex step has no capture, and its pick of the capture plan records a
`no_capture_point` miss.

## Contracts

- The Codex profile's base URL is `<gateway>/<route>`, with no `/v1`, so the capture tag lands where
  the gateway strips it. A tag after `/v1` gets a 403 from the gateway.
- The turn-inputs module captures a Codex step as it captures any other step, with no branch on the
  harness.

The gateway's endpoint match already takes `/v1/responses` and `/responses`. The pinned Codex CLI
keeps the tag segment: a turn with the base URL `<gateway>/<route>/~in.<tag>/v1` reached the model
as `/v1/responses`, and the gateway spooled one sealed capture.
