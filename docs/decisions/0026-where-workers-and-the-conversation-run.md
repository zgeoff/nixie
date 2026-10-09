# 0026: Where workers and the conversation run

- Date: 2026-10-09
- Status: decided, amended by [0030](./0030-connectors-and-sandbox-environments.md)
- Amends: [0003](./0003-sdk-placement.md), [0007](./0007-grants-and-taint.md)
- Research: [imp worker spike](../../spikes/imp-worker-start/),
  [sandbox adapter](./0016-own-interfaces.md)

Each worker run gets its own imp, and the whole worker runs inside it: the model loop through the
Agent SDK and any code it runs. nixie creates, wakes and destroys the imp through the sandbox
adapter from [0016](./0016-own-interfaces.md), with imp as the reference adapter. The worker reaches
everything outside the model API through nixie's tools on the host.

The conversation runs in a long-lived imp of its own, which stays awake in the first version. It may
sleep once imp keeps the guest's page cache across sleep, a candidate imp change.

The one credential grant a worker or conversation imp holds is the broker's model-API credential,
limited to the model API's host. The guest sees only a placeholder, and no other credential grant
goes to an imp that reads untrusted content. This amends [0007](./0007-grants-and-taint.md), which
gave such an imp no grant at all; the owner treats the model token and its plumbing as
configuration.

This amends [0003](./0003-sdk-placement.md), which ran assistant work on the host with only nixie's
tools. nixie's tools still run on the host in both cases, so every action still passes nixie's
policy.

## Why

- Anything that runs a model loop over untrusted content gets a sandbox. Workers read outside
  content, and the conversation is always untrusted under [0015](./0015-taint-scope.md), so both run
  in an imp, behind a microVM boundary as well as behind nixie's policy.
- A warm imp costs nothing a person notices. In the spike, a turn in a warm imp reached its first
  text in about 0.8 s, as fast as the same turn on the host
  ([imp worker spike](../../spikes/imp-worker-start/), 2026-10-09).
- A new worker is affordable. Creating an imp took 472 ms, waking one 363 ms and granting a
  credential 64 ms, and a fresh worker reached first text in about 2.5 to 3 s.
- About 2 s of a fresh worker's start went to reading Claude Code and Bun from a cold disk, which
  purpose-built images per kind of work and a warm host page cache address.
- The broker keeps the model credential out of the guest. In the spike, the guest held only a
  placeholder, no file the run wrote held the token, and imp's audit listed only paths on
  `api.anthropic.com`. Data sent on that grant reaches only the owner's own model account, which
  every turn reaches anyway.
- An awake conversation imp avoids a cold read on the owner's next message, which a sleeping imp
  pays until imp keeps the page cache across sleep.

## Alternatives

- **The worker's model loop on the host, with only its code in an imp.** It needs no route from the
  imp back to nixie's tools, and leaves the model process that reads untrusted content outside the
  sandbox.
- **The conversation on the host,** as 0003 placed it. Its process holds only nixie's tools, so
  policy still covers every action, and the process that reads untrusted content has no sandbox.
- **No model credential in any imp.** The model loop would have to run on the host, which leaves it
  outside the sandbox.
- **A sleeping conversation imp.** It frees host memory between messages, and each wake adds about
  363 ms plus the cold reads that the page cache would save.

## Consequences

- nixie builds a purpose-built image per kind of work: a minimal base, Bun, and the SDK with only
  the Claude Code build it needs for the conversation. Under
  [0030](./0030-connectors-and-sandbox-environments.md), the code and worker images include actual
  Node.js, Python and a familiar Linux toolbox. Start-up is measured with the host's page cache
  warm.
- Every imp needs a route back to nixie's tools on the host that does not reach imp's management
  API. [0030](./0030-connectors-and-sandbox-environments.md) settles it as a reverse forward over
  vsock with egress `none` and reopening after wake.
- The conversation imp holds host memory for the deployment's life.
- 2 candidate imp changes would cut start-up further: a warm template taken after a warm-up turn,
  with entropy and identity reseeded on restore, and a page cache kept across sleep for long-lived
  imps.
