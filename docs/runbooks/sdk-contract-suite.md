# Run the Agent SDK contract suite

The [Agent SDK contract suite](../../evals/sdk-contract/README.md) is a set of probes. Each probe
runs the Agent SDK version that `bun.lock` pins, sends the model one query, and checks one behaviour
that nixie relies on. No CI job runs the suite, because nixie's CI holds no model credential.

When a pull request changes the `@anthropic-ai/claude-agent-sdk` version, run the suite by hand at
its head commit. Post the output on the pull request. Merge the pull request only after that comment
shows every probe passing, as the Agent SDK bump rule in [AGENTS.md](../../AGENTS.md) requires.

## Where it runs

Run the suite inside an [imp](../glossary.md), a sandboxed microVM. The imp's broker removes the
credential from each request to the model API, and adds the real one:

- On an imp that a coding agent works in, the broker adds that agent's Claude subscription login.
- On an imp with a model [grant](../glossary.md), the broker adds the grant's credential.

Each probe starts the Claude Code CLI that the SDK runs, with an empty config directory, and passes
it the credential from `ANTHROPIC_AUTH_TOKEN` or `ANTHROPIC_API_KEY`. Inside an imp, any non-empty
value works, because the broker replaces it.

Outside an imp, the suite fails. The `model-grant` probe drops the credential you set, and sends
only a placeholder, which only a broker replaces. A local Claude Code login never reaches the probes
either, because each probe starts the CLI with an empty config directory.

## Run the suite

`NIXIE_SDK_CONTRACT=1` turns the probes on. Without it every probe skips, so a plain `bun test`
never calls the model. With it and neither credential variable set, every probe fails.

1. Check out the pull request's head commit:

   ```bash
   gh pr checkout <pr_number>
   ```

   `<pr_number>` is the number of the Agent SDK bump pull request.

2. Install its dependencies:

   ```bash
   bun install
   ```

3. Run the probes, with a placeholder credential:

   ```bash
   ANTHROPIC_AUTH_TOKEN=imp-broker-placeholder NIXIE_SDK_CONTRACT=1 bun test evals/sdk-contract
   ```

   Expect `0 fail`, and no `skip` line. The suite takes about 8 minutes on an agent's imp.

4. Post a comment on the pull request. Give the head commit's SHA and the command. Add the summary
   lines of the output, from the `pass` count to the `Ran` line:

   ```bash
   gh pr comment <pr_number> --body-file <comment_file>
   ```

   `<comment_file>` is a file that holds the comment.

After a push to the pull request, run the suite again at the new head. Post a new comment.

## Act on a failing probe

A probe that fails on a new SDK version shows that a behaviour nixie relies on changed.

1. Read the failing assertion.
2. Find the code or design that relies on it in the suite's
   [list of probes](../../evals/sdk-contract/README.md#the-probes).
3. If nixie needs the old behaviour, change that code before the bump merges. If nixie no longer
   needs it, rewrite the probe to the new behaviour.
4. Run the suite again. Post the new output on the pull request.

## Act on a probe that stops at its time limit

Bun prints `this test timed out after <limit>ms` for a probe that runs past its limit. The assertion
error printed after that line comes from the stopped probe, so ignore it.

1. In the probe's test file, set the probe's limit to `120_000`, so the probe finishes and you can
   time it. The limit is the last argument of the probe's `test` call, in milliseconds, and 120 s is
   the most that any model API test may take.
2. Run the suite with a JUnit report:

   ```bash
   ANTHROPIC_AUTH_TOKEN=imp-broker-placeholder NIXIE_SDK_CONTRACT=1 bun test evals/sdk-contract \
     --reporter=junit --reporter-outfile=<report_file>
   ```

   `<report_file>` is the path of the XML report. Each `testcase` element's `time` attribute holds
   the probe's time in seconds.

3. Set the probe's limit to about twice its time, in milliseconds, at most `120_000`.
4. Run the suite again, and expect `0 fail`.
