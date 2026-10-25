# Spike: the consent checker on real messages

This spike runs a consent checker over one deployment's own conversation turns. It pairs each tool
call that needs consent with the messages that started its turn, asks the checker whether those
messages asked for the call, and scores each verdict against a label for the pair. The checker is
the check guest that nixie ships, given a draft consent prompt, on the profile that the deployment
maps to the `checker` role. The
[decision point](../../docs/design/platform/policy/decision-point.md#consent) defines the check.

## Question

How often does the consent checker credit consent for a call the user did not ask for, and how often
does it miss consent for a call the user did ask for? With those rates, the decision point can
choose between trusting the checker alone and asking the user to confirm.

## Answer

The run has not finished, so this section holds no rates yet.

## Run it

Run the commands from the spike's directory. `<plain>` is the conversation records of a plain export
of the data directory, `<persona>` is the deployment's persona, `<cases>`, `<labels>` and `<checks>`
are files outside the repo, and `<home>` is the model's home directory. `label` and `check` read the
model credential from `ANTHROPIC_AUTH_TOKEN`, and one spend limit covers both.

```bash
bun run.ts cases --plain <plain> --out <cases>
bun run.ts label --plain <plain> --cases <cases> --persona <persona> --out <labels> --home <home>
bun run.ts check --cases <cases> --labels <labels> --out <checks> --home <home>
bun run.ts score --cases <cases> --labels <labels> --checks <checks>
```

- [build-consent-cases.ts](consent/build-consent-cases.ts) groups the calls into turns and builds
  the natural and swapped pairs.
- [build-label-turns.ts](consent/build-label-turns.ts) gives the labeller each turn's calls with the
  2 exchanges before it, so a "yes" to the assistant's offer reads as a request.
- [render-checker-input.ts](consent/render-checker-input.ts) marks each span the user did not type
  as pasted, and gives the call as its tool and input.
- [run-labels.ts](consent/run-labels.ts) and [run-checks.ts](consent/run-checks.ts) run the check
  guest's own query on each turn or pair, stop at the spend limit or at a call the model API
  refuses, and resume a run that stopped.
- [score-verdicts.ts](consent/score-verdicts.ts) gives the miss and wrong-credit rates with their
  95% Wilson intervals.

## Untested

- The prompt is a draft written for this spike, not a shipped prompt.
- The labels come from a language model given the deployment's persona, not from the user.
- The checker sees the input that each tool records, which can hold less than the call the decision
  point would check.
- The pairs cover the calls the model made: memory changes, ratings, skill writes and web fetches.
  The export holds no call that sends a message to another person.
