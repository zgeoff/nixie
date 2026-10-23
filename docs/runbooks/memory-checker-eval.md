# Run the memory checker eval

The [memory checker eval](../../evals/memory-checker/README.md) scores the memory checker on
labelled sets of messages and memories. A run calls the production checker with the production
prompt, on the input the content gate renders for each pair, 3 times each, through the check guest's
query and your local Claude Code login.

1. Run the eval on one set:

   ```bash
   env -u ANTHROPIC_API_KEY bun evals/memory-checker/run-memory-checker-eval.ts held-out-3 Sam
   ```

   The run takes a set's name and rewrites that set's report, such as
   [corpus-report.json](../../evals/memory-checker/corpus-report.json). An invented owner name after
   the set's name renders the prompt with that name and swaps it into each memory for "the owner",
   as a deployment with that name would see them.

2. Check the reports:

   ```bash
   bun test evals
   ```

   Expect every test to pass. The suite fails when a report came from another prompt, skipped a pair
   or rendered a pair's input differently from the gate. It fails when a call confirms a memory that
   any set's message does not assert, and when an answered call misses one that a tuning set's
   message asserts.

On a cloud imp, run the eval the same way, through the imp's Claude Code login. The imp's broker
forwards a subscription token, which the Messages API takes for Haiku but refuses for Sonnet with a
429 `rate_limit_error` when the request does not come from Claude Code. A runner that calls the API
directly from an imp works only with Haiku.
