# Spike: Mastra Connect as a reference for the connector designs

This reading spike compares Mastra Connect, a hosted service with an open client package that gives
Mastra agents tools on outside services, with nixie's
[connector designs](../../docs/design/platform/connectors/README.md) and the
[trigger source](../../docs/design/platform/channels/trigger-source.md). Mastra stays a reference:
nothing here proposes a dependency on it.

## Question

How does Mastra Connect model a connector, store and refresh credentials, expose tools to the model,
and handle errors and rate limits, and which of its choices would improve nixie's connector designs?

## Answer

- Connect's open client relies on a closed platform that holds the connections, runs the OAuth apps,
  stores the credentials and proxies every tool call, so it has no self-hosted form.
- Its tools come from Nango's integration templates (23 providers, almost 900 tools) and declare no
  effects.
- A refused refresh drops a provider's tools with no word to the model, as nixie's `needs_consent`
  does.
- With 2 or more connections, each tool of a provider gains a required `connection_name` argument
  whose values select exactly one account.
- A tool retries only a network error or a 5xx, and never repeats a write without an
  `Idempotency-Key`; the client has no 429 or `Retry-After` handling.

Adapt 5 ideas into the connector designs: the connection argument, a connection status the model can
see, what a failed read returns, headers the connector sets, and a failed listing on the MCP proxy.

## Results

The [results](results.md) hold the sources read, the comparison part by part, each idea worth
adapting with its outcome and scope, and the ideas left out.

## Untested

The platform's refresh timing, retry policy, rate-limit handling and storage are closed and
undocumented. The [untested note](results.md#untested) gives the limit.
