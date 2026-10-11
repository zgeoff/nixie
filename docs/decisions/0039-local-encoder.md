# 0039: The local encoder

- Date: 2026-10-11
- Status: decided
- Design: [memory context](../design/platform/memory/context.md#retrieval)
- Research: [encoder spike](../design/platform/spikes/encoder/)

The retrieval service from [0024](0024-memory-in-context.md) encodes text with `mdbr-leaf-ir`, using
its int8 ONNX weights. nixie runs the model through `onnxruntime-node` directly, with
`@huggingface/tokenizers` as the tokenizer. The index keeps the first 256 numbers of each vector,
normalised again and stored as int8.

The image build downloads the weights at a fixed Hugging Face revision. It checks each file against
a SHA-256 recorded in the repo, as it does for
[pinned binaries](../design/platform/deployment/release-pipeline.md#pinned-binaries). The bundle
leaves `onnxruntime-node` external, and the image carries its linux-x64 binary beside the bundle. At
start, nixie loads the model from that folder with remote downloads off.

## Why

- On the spike's 75 questions, leaf-ir found a relevant item in the top 5 for 0.82 of typed
  questions and 0.88 of keyword questions. That tied the best model under 50M parameters and beat
  the MiniLM baseline at 0.77.
- Vectors cut to 256 numbers in int8 kept that recall and take 256 bytes each: 5 MB for 20,000
  items, against 61 MB at full width in fp32.
- The model process is the smallest of the ONNX candidates: 96 MB once loaded and 183 MB at peak in
  a 2-CPU container. A query takes under 1 ms, and a rebuild over 20,000 short texts takes about 13
  s on 2 cores.
- The weights take 23 MB, under Apache-2.0.
- Calling ONNX Runtime directly keeps an image library out of the server. transformers.js loads
  `sharp` at start even for text.
- leaf-ir's public BEIR score is 53.55, ahead of 51.98 for arctic-embed-s. Both scores come from
  their publishers, and no third party has run either model.

## Alternatives

- **`snowflake-arctic-embed-s`, int8.** It matched leaf-ir on recall and has a longer public record.
  Its 384 numbers a vector are its minimum, 8 MB for 20,000 items in int8. Its process holds 68 MB
  more once loaded, and each text takes about a third longer.
- **EmbeddingGemma.** It ranked best, at 0.91 typed. It takes 10 times the query time, 520 MB at
  peak and 218 MB of weights, and the Gemma terms would travel with the image.
- **`all-MiniLM-L6-v2`.** It found fewer items, at 0.77 typed, from 90 MB of fp32 weights.
- **A static model such as `potion-base-8M`.** It needs no runtime and missed 6 of 20 paraphrase
  pairs.
- **transformers.js, fastembed or the WASM build of ONNX Runtime.** transformers.js needs a stand-in
  `sharp` module in the image. fastembed pads every text to 512 tokens, which took 39 ms a query and
  1.5 GB at peak. The WASM build ran 3.5 to 6 times slower.
- **128 numbers a vector.** Typed recall fell to 0.77.

The gain on your own questions remains unmeasured. A later change of encoder costs one full index
rebuild, which nixie runs at start.
