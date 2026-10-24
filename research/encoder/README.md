# Spike: the local encoder

This spike compares small local embedding models, each run by one library under Bun, for the
retrieval service in [context](../../docs/design/platform/memory/context.md#retrieval). It measures
retrieval quality, CPU time, peak memory and what each model takes to ship in the nixie image.

## Question

Which model and library should nixie's first build ship as its encoder? The encoder runs on a small
host, inside a container image built with `bun build`, from weights pinned into that image.

## Answer

- `mdbr-leaf-ir` int8 on `onnxruntime-node` ties `snowflake-arctic-embed-s` for the best recall of
  the small models on typed questions, 0.82 of 75 at recall@5, and scores 0.88 as keywords against
  arctic-s's 0.90.
- leaf-ir took 0.9 ms a query and 183 MB at peak in a 2-CPU container, with 23 MB of weights and 46
  MB of runtime.
- Cut to 256 numbers in int8, a leaf-ir vector takes 256 bytes, 5 MB for 20,000 items, with no loss
  of recall.
- EmbeddingGemma ranks best at 0.91, at 10 times the query time and 520 MB at peak.
- No candidate needs a native build step, and `bun build` needs `onnxruntime-node` marked external.

Ship `mdbr-leaf-ir` int8 on `onnxruntime-node` directly, and store 256-number int8 vectors.

## Run it

```bash
bun install
bun run.ts                         # every candidate, 3 rounds, all cores then 2 cores
bun run.ts leaf-ir-q8-ort arctic-s-q8-ort
bun bench.ts leaf-ir-q8-ort        # one candidate, one JSON line
```

The [setup](results.md#setup) gives the versions, the weights download and the harness.

## Results

The [results](results.md) hold the candidates, the quality, vector size, runtime and packaging
tables, and the runner-up.

## Untested

Questions that a user writes, since every question here is synthetic, and an arm64 host. The
[untested list](results.md#untested) gives the rest.
