# Spike: the consent checker on real messages

This spike runs a consent checker over one deployment's own conversation turns. It pairs each tool
call that needs consent with the messages that started its turn, asks the checker whether those
messages asked for the call, and scores each verdict against a label for the pair. The checker is
the check guest that nixie ships, given a draft consent prompt, on the profile that the deployment
maps to the `checker` role. The
[decision point](../../docs/design/platform/policy/decision-point.md#consent) defines the check.

## Question

How often does the consent checker credit consent for a call the user did not ask for, and how often
does it miss consent for a call the user did ask for? The answer tells the decision point whether it
can trust the checker alone or needs the user to confirm.

## Answer

The run has not finished, so this section holds no rates yet.

## Run it

Run the commands from the spike's directory. `<plain>` is the conversation records of a plain export
of the data directory, `<cases>`, `<checks>` and `<labels>` are files outside the repo, and `<home>`
is the checker's home directory. `check` reads the checker profile's credential from
`ANTHROPIC_AUTH_TOKEN`.

```bash
bun run.ts cases --plain <plain> --out <cases>
bun run.ts check --cases <cases> --out <checks> --home <home>
bun run.ts score --checks <checks> --labels <labels>
```

- [build-consent-cases.ts](consent/build-consent-cases.ts) groups the calls into turns and builds
  the natural and swapped pairs.
- [render-checker-input.ts](consent/render-checker-input.ts) marks each span the user did not type
  as pasted, and gives the call as its tool and input.
- [run-checks.ts](consent/run-checks.ts) runs the check guest's own query on each pair, stops at a
  spend limit, and resumes a run that stopped.
- [score-verdicts.ts](consent/score-verdicts.ts) gives the miss and wrong-credit rates with their
  95% Wilson intervals.

## Untested

- The prompt is a draft written for this spike, not a shipped prompt.
- The checker sees the input that each tool records, which can hold less than the call the decision
  point would check.
- The pairs cover the calls the model made: memory changes, ratings, skill writes and web fetches.
  The export holds no call that sends a message to another person.
