/* oxlint-disable max-statements -- a throwaway spike */
// Loads one candidate and returns a function that embeds a batch of texts into unit vectors. Model
// files come from MODELS_DIR, outside the repo by default, which the first run fills from Hugging Face.
import { mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Candidate } from './candidates.ts';

export type Embed = (texts: string[]) => Promise<Float32Array[]>;

export const MODELS_DIR = path.resolve(process.env.MODELS_DIR ?? path.join(os.homedir(), '.cache', 'nixie-encoder-spike'));
const THREADS = Number(process.env.THREADS ?? 0);

export async function loadEncoder(candidate: Candidate): Promise<Embed> {
  switch (candidate.runner) {
    case 'transformers': {
      return loadTransformersEncoder(candidate);
    }
    case 'ort-wasm':
    case 'ort-node': {
      return loadORTEncoder(candidate);
    }
    case 'fastembed': {
      return loadFastembedEncoder(candidate);
    }
    case 'static': {
      return loadStaticEncoder(candidate);
    }
  }
}

async function loadTransformersEncoder(candidate: Candidate): Promise<Embed> {
  const { AutoModel, AutoTokenizer, env, pipeline } = await import('@huggingface/transformers');
  env.cacheDir = MODELS_DIR;
  env.allowRemoteModels = process.env.OFFLINE !== '1';
  const
    sessionOptions = THREADS > 0 ? { intraOpNumThreads: THREADS, interOpNumThreads: 1 } : {};
  if (candidate.pooling === 'none') {
    const tokenizer = await AutoTokenizer.from_pretrained(candidate.model),
      model = await AutoModel.from_pretrained(candidate.model, {
        dtype: candidate.dtype,
        session_options: sessionOptions,
      });
    return async (texts) => {
      const inputs = await tokenizer(texts, { padding: true, truncation: true }),
        output = await model(inputs),
        tensor = output.sentence_embedding;
      return splitRows(tensor.data as Float32Array, tensor.dims as [number, number], true);
    };
  }
  const extractor = await pipeline('feature-extraction', candidate.model, {
    dtype: candidate.dtype,
    session_options: sessionOptions,
  });
  const pooling = candidate.pooling ?? 'mean';
  return async (texts) => {
    const output = await extractor(texts, { normalize: true, pooling });
    return splitRows(output.data as Float32Array, output.dims as [number, number], false);
  };
}

// onnxruntime directly with the pure-JS tokenizer: the WASM build needs no native addon, and the
// node build needs only its own binary, without transformers.js and its image dependency
async function loadORTEncoder(candidate: Candidate): Promise<Embed> {
  const wasm = candidate.runner === 'ort-wasm';
  const ort = wasm ? await import('onnxruntime-web') : await import('onnxruntime-node');
  const { Tokenizer } = await import('@huggingface/tokenizers');
  if (wasm) {
    const webORT = ort as typeof import('onnxruntime-web');
    webORT.env.wasm.wasmPaths =
      process.env.ORT_WASM_DIR ?? `${path.dirname(Bun.resolveSync('onnxruntime-web', import.meta.dir))}/`;
    webORT.env.wasm.numThreads = THREADS > 0 ? THREADS : 4;
  }
  const fileName = candidate.dtype === 'q8' ? 'model_quantized.onnx' : 'model.onnx';
  const [tokenizerJSON, tokenizerConfig, modelBytes] = await Promise.all([
    readModelFile(candidate.model, 'tokenizer.json').then((bytes) => JSON.parse(bytes.toString())),
    readModelFile(candidate.model, 'tokenizer_config.json').then((bytes) => JSON.parse(bytes.toString())),
    readModelFile(candidate.model, `onnx/${fileName}`),
  ]);
  // a model with external weights loads by path so the runtime finds the .onnx_data beside it
  const external = Bun.file(path.join(MODELS_DIR, candidate.model, `onnx/${fileName}_data`));
  if (!wasm && !(await external.exists()) && process.env.OFFLINE !== '1') {
    // most models keep their weights inside the .onnx file, so only a missing file is expected here
    await readModelFile(candidate.model, `onnx/${fileName}_data`).catch((error: unknown) => {
      if (!(error instanceof Error && error.message.endsWith('HTTP 404'))) {
        throw error;
      }
    });
  }
  const modelPath = path.join(MODELS_DIR, candidate.model, `onnx/${fileName}`),
    options = wasm
      ? { executionProviders: ['wasm'] }
      : { executionProviders: ['cpu'], ...(THREADS > 0 ? { interOpNumThreads: 1, intraOpNumThreads: THREADS } : {}) };
  const tokenizer = new Tokenizer(tokenizerJSON, tokenizerConfig),
    session = wasm
      ? await ort.InferenceSession.create(new Uint8Array(modelBytes), options)
      : await ort.InferenceSession.create(modelPath, options),
    maxLength = 512;
  return async (texts) => {
    const encoded = texts.map((text) => tokenizer.encode(text).ids.slice(0, maxLength)),
      width = Math.max(...encoded.map((ids) => ids.length)),
      ids = new BigInt64Array(texts.length * width),
      mask = new BigInt64Array(texts.length * width);
    encoded.forEach((row, rowIndex) => {
      row.forEach((id, column) => {
        ids[rowIndex * width + column] = BigInt(id);
        mask[rowIndex * width + column] = 1n;
      });
    });
    const feeds: Record<string, InstanceType<typeof ort.Tensor>> = {
      attention_mask: new ort.Tensor('int64', mask, [texts.length, width]),
      input_ids: new ort.Tensor('int64', ids, [texts.length, width]),
    };
    if (session.inputNames.includes('token_type_ids')) {
      feeds.token_type_ids = new ort.Tensor('int64', new BigInt64Array(texts.length * width), [texts.length, width]);
    }
    const outputs = await session.run(feeds);
    if (outputs.sentence_embedding) {
      const pooled = outputs.sentence_embedding;
      return splitRows(pooled.data as Float32Array, pooled.dims as [number, number], true);
    }
    const output = outputs.last_hidden_state;
    if (!output) {
      throw new Error('the model has no last_hidden_state output');
    }
    const data = output.data as Float32Array,
      dims = output.dims[2] ?? 0;
    return encoded.map((row, rowIndex) => {
      const base = rowIndex * width * dims;
      if (candidate.pooling === 'cls') {
        return normalizeVector(data.slice(base, base + dims));
      }
      const vector = new Float32Array(dims);
      for (let column = 0; column < row.length; column += 1) {
        for (let index = 0; index < dims; index += 1) {
          vector[index] = (vector[index] ?? 0) + (data[base + column * dims + index] ?? 0);
        }
      }
      return normalizeVector(vector);
    });
  };
}

async function loadFastembedEncoder(candidate: Candidate): Promise<Embed> {
  const { EmbeddingModel, FlagEmbedding } = await import('fastembed');
  const model = await FlagEmbedding.init({
    cacheDir: MODELS_DIR,
    // fastembed pads every text to maxLength, 512 unless set
    ...(process.env.FASTEMBED_MAX_LENGTH ? { maxLength: Number(process.env.FASTEMBED_MAX_LENGTH) } : {}),
    model: candidate.model as (typeof EmbeddingModel)[keyof typeof EmbeddingModel],
  });
  return async (texts) => {
    const rows: Float32Array[] = [];
    for await (const batch of model.embed(texts, texts.length)) {
      for (const row of batch) {
        rows.push(normalizeVector(Float32Array.from(row)));
      }
    }
    return rows;
  };
}

// model2vec: a static table of token vectors, averaged over the text's tokens and normalised
async function loadStaticEncoder(candidate: Candidate): Promise<Embed> {
  const { Tokenizer } = await import('@huggingface/tokenizers');
  const dir = path.join(MODELS_DIR, candidate.model);
  await mkdir(dir, { recursive: true });
  const [tokenizerJSON, tokenizerConfig] = await Promise.all([
    readModelFile(candidate.model, 'tokenizer.json').then((bytes) => JSON.parse(bytes.toString())),
    readModelFile(candidate.model, 'tokenizer_config.json')
      .then((bytes) => JSON.parse(bytes.toString()))
      .catch(() => ({})),
  ]);
  await readModelFile(candidate.model, 'model.safetensors');
  const tokenizer = new Tokenizer(tokenizerJSON, tokenizerConfig),
    { table, dims } = await loadSafetensors(path.join(dir, 'model.safetensors'));
  return async (texts) =>
    texts.map((text) => {
      const ids = tokenizer.encode(text, { add_special_tokens: false }).ids,
        vector = new Float32Array(dims);
      for (const id of ids) {
        const offset = id * dims;
        for (let index = 0; index < dims; index += 1) {
          vector[index] = (vector[index] ?? 0) + (table[offset + index] ?? 0);
        }
      }
      return normalizeVector(vector);
    });
}

async function readModelFile(model: string, name: string): Promise<Buffer> {
  const file = Bun.file(path.join(MODELS_DIR, model, name));
  if (await file.exists()) {
    return Buffer.from(await file.arrayBuffer());
  }
  if (process.env.OFFLINE === '1') {
    throw new Error(`${model}/${name} is not in the local model folder`);
  }
  const response = await fetch(`https://huggingface.co/${model}/resolve/main/${name}`);
  if (!response.ok) {
    throw new Error(`${model}/${name}: HTTP ${response.status}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  await Bun.write(file, bytes);
  return bytes;
}

// reads only the header and the one tensor, so the weights sit in memory once
async function loadSafetensors(filePath: string): Promise<{ table: Float32Array; dims: number }> {
  const file = Bun.file(filePath),
    headerLength = Number(Buffer.from(await file.slice(0, 8).arrayBuffer()).readBigUInt64LE(0)),
    header = JSON.parse(await file.slice(8, 8 + headerLength).text()) as Record<
      string,
      { dtype: string; shape: number[]; data_offsets: [number, number] }
    >,
    entry = Object.entries(header).find(([name]) => name !== '__metadata__')?.[1];
  if (!entry || entry.dtype !== 'F32' || entry.shape.length !== 2) {
    throw new Error(`unexpected safetensors tensor: ${JSON.stringify(entry)}`);
  }
  const start = 8 + headerLength + entry.data_offsets[0],
    end = 8 + headerLength + entry.data_offsets[1];
  return { dims: entry.shape[1] ?? 0, table: new Float32Array(await file.slice(start, end).arrayBuffer()) };
}

function splitRows(data: Float32Array, [rows, dims]: [number, number], normalize: boolean): Float32Array[] {
  return Array.from({ length: rows }, (_, row) => {
    const vector = data.slice(row * dims, (row + 1) * dims);
    return normalize ? normalizeVector(vector) : vector;
  });
}

function normalizeVector(vector: Float32Array): Float32Array {
  let sum = 0;
  for (const value of vector) {
    sum += value * value;
  }
  const norm = Math.sqrt(sum) || 1;
  return vector.map((value) => value / norm);
}
