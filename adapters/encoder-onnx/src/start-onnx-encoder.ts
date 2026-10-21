import { join } from 'node:path';
import type { Encoder } from '@heynixie/memory';
import { Tokenizer } from '@huggingface/tokenizers';

export interface ONNXEncoder extends Encoder {
  readonly stop: () => Promise<void>;
}

// The model card asks for this prefix on a query and for none on a stored text.
const queryPrefix = 'Represent this sentence for searching relevant passages: ';

export async function startONNXEncoder(modelDir: string): Promise<ONNXEncoder> {
  // A dynamic import loads the native ONNX runtime only in a process that runs the encoder.
  const ort = await import('onnxruntime-node');

  const [tokenizerJSON, tokenizerConfig] = await Promise.all([
    readJSONObject(join(modelDir, 'tokenizer.json')),
    readJSONObject(join(modelDir, 'tokenizer_config.json')),
  ]);

  const tokenizer = new Tokenizer(tokenizerJSON, tokenizerConfig);

  // The session loads by path, so the runtime finds the .onnx_data weights beside the graph.
  const session = await ort.InferenceSession.create(join(modelDir, 'onnx/model_quantized.onnx'), {
    executionProviders: ['cpu'],
    interOpNumThreads: 1,
  });

  // The int8 graph quantizes each run by its largest values, so a text batched with others encodes
  // differently from the same text alone. One text a run keeps each vector free of its neighbours.
  const encodeText = async (text: string): Promise<Float32Array> => {
    const ids = buildModelIDs(tokenizer.encode(text).ids);
    const shape = [1, ids.length];

    const outputs = await session.run({
      input_ids: new ort.Tensor('int64', BigInt64Array.from(ids, BigInt), shape),
      attention_mask: new ort.Tensor('int64', new BigInt64Array(ids.length).fill(1n), shape),

      token_type_ids: new ort.Tensor('int64', new BigInt64Array(ids.length), shape),
    });

    const pooled = outputs['sentence_embedding'];

    if (pooled === undefined) {
      throw new Error('the encoder model has no sentence_embedding output');
    }

    if (!(pooled.data instanceof Float32Array)) {
      throw new Error(
        `the encoder model's sentence_embedding output is ${pooled.type}, not float32`,
      );
    }

    return normalizeVector(pooled.data);
  };

  return {
    encode: async (texts, kind) => {
      const vectors: Float32Array[] = [];

      for (const text of texts) {
        const input = kind === 'query' ? `${queryPrefix}${text}` : text;

        const vector = await encodeText(input);

        vectors.push(vector);
      }

      return vectors;
    },
    stop: () => session.release(),
  };
}

async function readJSONObject(path: string): Promise<object> {
  const value: unknown = await Bun.file(path).json();

  if (typeof value !== 'object' || value === null) {
    throw new Error(`${path} holds no JSON object`);
  }

  return value;
}

const maxTokens = 512;

function buildModelIDs(ids: readonly number[]): readonly number[] {
  const last = ids.at(-1);

  return ids.length <= maxTokens || last === undefined
    ? ids
    : [...ids.slice(0, maxTokens - 1), last];
}

function normalizeVector(vector: Float32Array): Float32Array {
  const norm = Math.hypot(...vector);

  return norm === 0 ? vector : vector.map((value) => value / norm);
}
