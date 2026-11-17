# Agent SDK probes

An Agent SDK probe is one query that checks one SDK behaviour nixie relies on. The same probe runs
against a stub model in CI and against the live model by hand.

- Write the probe as a function in the conversation guest's
  [`sdk-contract`](../../../../guests/conversation/src/sdk-contract/index.ts) folder.
- Run the probe against the guest's
  [stub model](../../../../guests/conversation/src/test-utils/start-stub-model.ts) from a
  `*.agent-sdk.test.ts` suite in `guests/conversation/src/`.
- Run it against the live model from a `*.model-api.test.ts` file in `evals/sdk-contract/`, which
  imports it from `@heynixie/conversation/sdk-contract`.
