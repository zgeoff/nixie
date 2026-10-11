# Spike: the local encoder

This spike compares small local embedding models, each run by one library under Bun, for the
retrieval service in [context](../../memory/context.md#retrieval). It measures retrieval quality,
CPU time, peak memory and what each one takes to ship in the nixie image. It is the evidence for
[GEO-303](https://linear.app/zgeoff/issue/GEO-303).

The encoder serves retrieval only. Per-turn retrieval and the recall tools search with it, and the
memory writer meets it through the items retrieval hands it when it looks for a near-duplicate. The
[quote check](../../memory/writes.md#the-quote-check) compares text exactly and never uses the
encoder.

- Bun 1.4.2 on an 8-core x86-64 desktop CPU, CPU only, and in the `oven/bun:1.4.2-slim` container
- `@huggingface/transformers` 4.3.1 on `onnxruntime-node` 1.30.0
- `onnxruntime-node` 1.30.0 and `onnxruntime-web` 1.30.0 called directly, with
  `@huggingface/tokenizers` 0.2.0
- `fastembed` 3.0.0, which runs `onnxruntime-node` 1.21.0 and a native tokenizer

## Question

Which model and library should nixie's first build ship as its encoder? The encoder runs on a small
host, inside a container image built with `bun build`, from weights pinned into that image.

## Run it

Run the commands from this directory. The first run downloads about 1.5 GB of weights from Hugging
Face, with no account, into `MODELS_DIR`, which defaults to `~/.cache/nixie-encoder-spike`. A run
after that loads every model offline.

```bash
bun install
bun run.ts                         # every candidate, 3 rounds, all cores then 2 cores
bun run.ts leaf-ir-q8-ort arctic-s-q8-ort
bun bench.ts leaf-ir-q8-ort        # one candidate, one JSON line
```

- [candidates.ts](candidates.ts) lists each candidate: a model, a library, a weight type and the
  prefixes from its model card.
- [load-encoder.ts](load-encoder.ts) loads a candidate through transformers.js, ONNX Runtime
  directly, fastembed or a static table, and returns unit vectors.
- [bench.ts](bench.ts) runs one candidate in its own process, so each peak RSS is its own. It warms
  the model, times 50 single queries and a corpus of 356 texts in batches of 32, and scores recall.
- [pairs.ts](pairs.ts) holds 30 short memories, each with a question you might type, plus 50
  distractors that share their words: 10 questions share a content word with their memory and 20
  share none.
- The 276 items and 75 questions come from the [retrieval spike](../memory-retrieval/README.md).
- [bundle-entry.ts](bundle-entry.ts) is the image test: it embeds one text and lists the native
  libraries the process mapped.

## Candidates

| Candidate         | Model                                         | Library                      | Weights | Licence            |
| ----------------- | --------------------------------------------- | ---------------------------- | ------- | ------------------ |
| `leaf-ir-q8-ort`  | `MongoDB/mdbr-leaf-ir`, int8                  | `onnxruntime-node` directly  | 23 MB   | Apache-2.0         |
| `arctic-s-q8-ort` | `Snowflake/snowflake-arctic-embed-s`, int8    | `onnxruntime-node` directly  | 34 MB   | Apache-2.0         |
| `minilm`          | `Xenova/all-MiniLM-L6-v2`, fp32               | transformers.js              | 90 MB   | Apache-2.0         |
| `gemma-q4`        | `onnx-community/embeddinggemma-300m-ONNX`, q4 | transformers.js              | 218 MB  | Gemma Terms of Use |
| `potion-base-8m`  | `minishlab/potion-base-8M`                    | a static table in TypeScript | 31 MB   | MIT                |

Weights count the ONNX or safetensors files plus the tokenizer files. MiniLM is the baseline from
the retrieval spike. The spike measured 13 more variants:

- `bge-small-en-v1.5` in fp32 and int8 on transformers.js, and in fastembed
- `snowflake-arctic-embed-s` in fp32 on transformers.js and on `onnxruntime-web`, and int8 on
  transformers.js and on `onnxruntime-web`
- `snowflake-arctic-embed-xs` and `granite-embedding-small-english-r2`, fp32 on transformers.js
- `mdbr-leaf-ir` in fp32 and int8 on transformers.js
- EmbeddingGemma in int8, and `potion-retrieval-32M`

## Quality

The public scores are mean NDCG@10 over the MTEB English retrieval tasks: 15 datasets for MTEB v1
and 10 for MTEB(eng, v2). Recall@5 counts a question as found when a gold item ranks in the top 5.
The 75 questions run in 2 forms, as you would type them and as recall-tool keywords:

| Candidate         | MTEB v1 | MTEB v2 | 30 pairs | 75 typed | 75 keywords | MRR typed |
| ----------------- | ------- | ------- | -------- | -------- | ----------- | --------- |
| `leaf-ir-q8-ort`  | 53.55   | none    | 29/30    | 0.82     | 0.88        | 0.72      |
| `arctic-s-q8-ort` | 51.98   | 54.85   | 28/30    | 0.82     | 0.90        | 0.73      |
| `minilm`          | 41.95   | 42.92   | 30/30    | 0.77     | 0.85        | 0.67      |
| `gemma-q4`        | none    | 55.69   | 30/30    | 0.91     | 0.93        | 0.79      |
| `potion-base-8m`  | none    | 31.11   | 24/30    | 0.71     | 0.85        | 0.61      |

- **The public scores come from 2 kinds of source.** The `mdbr-leaf-ir` model card reports its
  53.55, and nobody recomputed it. The arctic, MiniLM and potion v1 and v2 scores, and the
  EmbeddingGemma v2 score, are means over the per-task results in the MTEB results repository, which
  reproduce each model card's own figure where the card gives one.
- **The 30 pairs separate only the weakest models.** MiniLM and EmbeddingGemma found all 30, and
  every model found all 10 lexical questions. The pairs show that potion misses paraphrase: it found
  14 of 20, where the ONNX models found 17 to 20. The 75 questions carry the ranking.
- **The harness reproduces the retrieval spike.** MiniLM scored 0.77 typed and 0.85 keywords, the
  same as in that spike.
- **EmbeddingGemma ranks best, and leaf-ir and arctic-s tie behind it.** EmbeddingGemma found 0.91
  of the typed questions. leaf-ir and arctic-s found 0.82 in fp32 and int8 alike, and int8 changed
  recall@5 by 2 points at most against fp32.
- **bge-small and granite-r2 trail MiniLM here.** bge-small scored 0.67 typed with its instruction
  prefix, and granite-r2 scored 0.71, so neither is a candidate.

## Runtime and memory

Each figure is the median of 3 runs, each in a fresh process, pinned to 2 cores with `taskset` and 2
ONNX Runtime threads. Query is one text per call. Batch is the time per text across the 356-text
corpus in batches of 32. RSS loaded is after the model loads, and RSS peak is the process maximum:

| Candidate                     | Load   | Query   | Batch, per text | RSS loaded | RSS peak |
| ----------------------------- | ------ | ------- | --------------- | ---------- | -------- |
| `leaf-ir-q8-ort`              | 54 ms  | 0.8 ms  | 0.66 ms         | 97 MB      | 180 MB   |
| `leaf-ir-q8`, transformers.js | 98 ms  | 1.1 ms  | 0.69 ms         | 123 MB     | 229 MB   |
| `arctic-s-q8-ort`             | 101 ms | 1.1 ms  | 0.90 ms         | 164 MB     | 221 MB   |
| `arctic-s-q8-wasm`            | 453 ms | 8.6 ms  | 6.01 ms         | 260 MB     | 306 MB   |
| `minilm`                      | 148 ms | 1.1 ms  | 1.24 ms         | 226 MB     | 324 MB   |
| `gemma-q4`                    | 554 ms | 10.2 ms | 12.86 ms        | 464 MB     | 520 MB   |
| `potion-base-8m`              | 30 ms  | 0.02 ms | 0.03 ms         | 107 MB     | 130 MB   |
| `bge-small-fastembed`         | 99 ms  | 39.4 ms | 58.36 ms        | 180 MB     | 1,522 MB |

- **The int8 ONNX models take 0.8 to 1.5 ms a query, and the fp32 ones up to 3.3 ms.** Per-turn
  retrieval embeds one query a turn, so query time never decides between them.
- **A full rebuild is seconds.** At the batch rates above, 20,000 short texts take about 13 s with
  leaf-ir and 18 s with arctic-s on 2 cores. Messages longer than these 1-sentence texts cost more
  per text.
- **fastembed pads every text to `maxLength`, 512 by default.** That padding gives it 39 ms a query
  and 1.5 GB at peak. At a `maxLength` of 128 it took 15.5 ms a query and 622 MB at peak.
- **The WASM build runs 3.5 to 6 times slower than the native one.** arctic-s fp32 on
  `onnxruntime-web` held 575 MB once loaded, against 291 MB on `onnxruntime-node`.
- **EmbeddingGemma int8 took 60 ms a query, against 10 ms for its q4 weights.** Its batch time
  matched q4 within 15%, and the spike never found the cause.

On all 16 threads, leaf-ir int8 on transformers.js took 1.1 ms a query and 0.46 ms a text in
batches. The 2-core figures stand for the small host.

## Packaging

The image test bundles [bundle-entry.ts](bundle-entry.ts) and [bench.ts](bench.ts) with
`bun build --target=bun`, then runs them in `oven/bun:1.4.2-slim` with `--network none`,
`--read-only`, `--cpus 2` and `--memory 512m`. The container holds only the bundle, the runtime
files and the weights, read from a mounted folder with remote downloads off.

| Candidate          | Query   | Batch, per text | RSS peak | Runtime files in the image               |
| ------------------ | ------- | --------------- | -------- | ---------------------------------------- |
| `leaf-ir-q8-ort`   | 0.9 ms  | 0.67 ms         | 183 MB   | `onnxruntime-node` for linux-x64, 46 MB  |
| `arctic-s-q8-ort`  | 1.1 ms  | 0.87 ms         | 182 MB   | `onnxruntime-node` for linux-x64, 46 MB  |
| `leaf-ir-q8`       | 0.9 ms  | 0.71 ms         | 202 MB   | the same, plus a stand-in `sharp` module |
| `arctic-s-q8-wasm` | 6.9 ms  | 5.95 ms         | 304 MB   | `ort-wasm-simd-threaded.wasm`, 14 MB     |
| `potion-base-8m`   | 0.02 ms | 0.02 ms         | 125 MB   | none                                     |

- **No candidate needs a native build step.** `onnxruntime-node` ships prebuilt binaries for 5
  platforms in its npm package, 288 MB in all and 45 MB for linux-x64. Bun blocks its postinstall
  script, which only fetches the CUDA libraries, and the CPU runtime works without it.
- **`bun build` cannot inline a native addon.** Mark `onnxruntime-node` external and copy its
  `package.json`, `dist/` and `bin/napi-v6/linux/x64/`, with `onnxruntime-common`, beside the
  bundle.
- **A bundle run on the build machine proves nothing.** The bundle holds absolute paths from the
  build machine, and with `node_modules` hidden it still loaded the runtime from Bun's global
  install cache. Only the container run shows what the image needs.
- **transformers.js loads `sharp` when it loads, though text never uses images.** Its native image
  binaries add 37 MB; a stand-in `sharp` module that throws avoids them. ONNX Runtime called
  directly needs neither, and the bundle shrinks from 1.25 MB to 171 KB.
- **ONNX Runtime writes a telemetry device ID.** It keeps the ID under
  `~/.cache/Microsoft/DeveloperTools/.onnxruntime/`. On a read-only root it logs
  `Failed to persist telemetry device ID; using an in-memory identifier` and carries on.

The weights pin as the [pinned binaries](../../deployment/release-pipeline.md#pinned-binaries) do.
The image build downloads each file at a fixed Hugging Face revision and checks it against a
recorded SHA-256 with `sha256sum -c`. Hugging Face lists each large file's SHA-256, and the local
`sha256sum` of `onnx/model_quantized.onnx_data` matched it: `e77ea96a…` at `mdbr-leaf-ir` revision
`4262131b32c3182bd06e67e92ae69d7bd66e0c5c`. At start, nixie loads the folder with remote downloads
off.

## Recommendation

Ship `mdbr-leaf-ir` with int8 weights, run by `onnxruntime-node` directly with
`@huggingface/tokenizers` for the tokenizer:

- It ties arctic-s for the best recall of the small models: 0.82 typed, 0.88 keywords.
- It is the fastest and lightest of them: 0.9 ms a query and 183 MB at peak in the 2-CPU container.
- Its weights are 23 MB under Apache-2.0, and the runtime adds 46 MB with no image library.
- Its ONNX graph pools inside the model, so the code takes the `sentence_embedding` output and
  normalises it.

The risks are its public score and its width. Its 53.55 is the publisher's own figure, unchecked.
Its vectors have 768 dimensions, so 20,000 items hold about 61 MB in fp32, twice arctic-s.

The runner-up is `snowflake-arctic-embed-s` int8 on the same runner. It matches leaf-ir on recall
and has independently computed MTEB scores and 384 dimensions. It costs about a third more time per
text and 11 MB more weights. Choose it if a checked benchmark and a smaller index count for more
than speed. Moving between the two changes the model folder and the pooling: arctic-s takes the
first token of `last_hidden_state`.

The other options trade away more:

- **transformers.js** gives a shorter loader and handles pooling, and it needs the `sharp` stand-in
  in the image.
- **EmbeddingGemma** ranks best, at 10 times the query time, 520 MB at peak, 218 MB of weights and
  Gemma terms that travel with the image.
- **potion-base-8M** runs 40 times faster with no runtime, and it missed 6 of the 20 paraphrase
  pairs.
- **fastembed** pads to 512 tokens on an older runtime and offers only a fixed model list.

## Untested

- **Questions you write.** Every item, pair and question here is synthetic, and one author wrote
  them with the items in view. The gain on your own questions is unmeasured.
- Recall with leaf-ir's vectors cut to 256 dimensions, which its card offers.
- Whether ONNX Runtime sends telemetry over the network; every container run had none.
- An arm64 host, and a rebuild over long past messages.
- Recall over a few thousand items, and with BM25 fused, as the retrieval spike ran it.
