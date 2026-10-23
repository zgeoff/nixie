# Run the Agent SDK contract suite

The [Agent SDK contract suite](../../evals/sdk-contract/README.md) runs the Agent SDK version that
`bun.lock` pins against the model, and checks each behaviour that nixie relies on. The probes read
the model credential from `ANTHROPIC_AUTH_TOKEN` or `ANTHROPIC_API_KEY`, the variables the
conversation guest reads. Inside a sandbox with a model grant, the variable holds the grant's
placeholder and the broker adds the real credential on the way out. The local login that the
[memory checker eval](./memory-checker-eval.md) uses does not work here, because each probe gives
the CLI an empty config directory and reads the session transcripts in it.

## Run the suite

1. Set `ANTHROPIC_AUTH_TOKEN` or `ANTHROPIC_API_KEY` to a model credential, or run inside a sandbox
   with a model grant.

2. Run the probes:

   ```bash
   NIXIE_SDK_CONTRACT=1 bun test evals/sdk-contract
   ```

   Expect every probe to pass. A full run takes about 3 minutes and cost $0.47 in the SDK's estimate
   on SDK 0.3.290.

Without `NIXIE_SDK_CONTRACT=1` every probe skips, so a plain `bun test` never calls the model. With
it and neither variable set, every probe fails.

## Act on a failing probe

A probe that fails on a new SDK version marks a behaviour that changed under nixie.

1. Read the failing assertion.
2. Find the code or design that relies on it in the suite's
   [list of probes](../../evals/sdk-contract/README.md#the-probes).
3. Change that code before the bump lands, or rewrite the probe to the new behaviour once nixie no
   longer depends on the old one.
