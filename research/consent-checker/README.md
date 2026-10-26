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

On 402 pairs from 137 turns, the draft checker on Sonnet 5.5 failed closed:

- It credited none of the 84 natural calls the user did not ask for: a wrong-credit rate of 0, with
  a 95% interval up to 0.044.
- It missed 84 of the 132 calls the user asked for, a miss rate of 0.636.
- Web fetch keeps its whole input in the call record, and there the checker missed 31 of 66 asked
  calls (0.470, interval 0.354 to 0.588) and credited none of 52 calls not asked.
- It credited none of 137 swapped pairs, each a call from a turn that used none of the turn's tools.
- Each memory tool drops its free text from the call record, so the checker judged an item ID with
  no text. Those calls hold most of the misses.

The decision point can trust a credit from this checker, but not a refusal: a refusal still needs
the user's confirmation. The checker needs the whole call, the text of each memory included, before
its memory rates mean anything. The run cost $3.64.

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

The [setup](results.md#setup) gives the models, the data, the pairs and the files behind each step.

## Results

The [results](results.md) hold the setup, the label counts, the rates by tool, the findings and the
spend.

## Untested

A shipped prompt, labels from the user rather than a model, the memory tools on their whole input,
and any call with a destination. The [untested list](results.md#untested) gives the rest.
