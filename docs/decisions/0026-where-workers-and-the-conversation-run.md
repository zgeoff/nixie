# 0026: Where workers and the conversation run

- Date: 2026-10-09
- Status: decided
- Design: [sandbox adapter](../design/connectors/sandbox-adapter.md),
  [deployment](../design/deployment/deployment.md)
- Research: [imp worker spike](../../spikes/imp-worker-start/)

Each worker run gets its own imp, and the whole worker runs inside it: the model loop through the
Agent SDK and any code it runs. nixie creates, wakes and destroys the imp through the sandbox
adapter from [0016](./0016-own-interfaces.md). The worker reaches everything outside the model API
through nixie's tools on the host, over the route from
[0030](./0030-connectors-and-sandbox-environments.md).

The conversation runs in a long-lived imp of its own, which stays awake. It may sleep once imp keeps
the guest's page cache across sleep, a candidate imp change.

The one credential grant a worker or conversation imp holds is the broker's model-API credential,
limited to the model API's host. The guest sees only a placeholder.

## Why

- Anything that runs a model loop over untrusted content gets a sandbox. Workers read outside
  content, and the conversation is always untrusted under [0015](./0015-taint-scope.md), so both run
  in an imp, behind a microVM boundary as well as behind nixie's policy.
- A warm imp costs nothing a person notices. In the spike, a turn in a warm imp reached its first
  text in about 0.8 s, as fast as the same turn on the host.
- A new worker is affordable: creating an imp took 472 ms and a fresh worker reached first text in
  about 2.5 to 3 s, most of it cold disk reads that purpose-built images address.
- The broker keeps the model credential out of the guest, which held only a placeholder in the
  spike.
- An awake conversation imp avoids a cold read on your next message.

## Alternatives

- **The worker's model loop on the host, with only its code in an imp.** It needs no route from the
  imp back to nixie's tools, and leaves the model process that reads untrusted content outside the
  sandbox.
- **The conversation on the host with only nixie's tools.** Policy still covers every action, and
  the process that reads untrusted content has no sandbox.
- **No model credential in any imp.** The model loop would have to run on the host, outside the
  sandbox.
- **A sleeping conversation imp.** It frees host memory between messages, and each wake adds about
  363 ms plus the cold reads that the page cache would save.

## Consequences

- nixie builds a purpose-built imp image per kind of work. The conversation image holds a minimal
  base, Bun, and the SDK with only the Claude Code build it needs. The worker image adds the code
  environment from 0030.
- The conversation imp holds host memory for the deployment's life.
- 2 candidate imp changes would cut start-up further: a warm template taken after a warm-up turn,
  with entropy and identity reseeded on restore, and a page cache kept across sleep for long-lived
  imps.
