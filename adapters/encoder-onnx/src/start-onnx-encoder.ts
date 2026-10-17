import { join } from 'node:path';
import type { Encoder } from '@heynixie/memory';
import { Tokenizer } from '@huggingface/tokenizers';

export interface ONNXEncoder extends Encoder {
  // releases the model's session; an encode after it fails
  readonly stop: () => Promise<void>;
}

// Loads mdbr-leaf-ir's int8 weights and tokenizer from modelDir alone, fetching nothing, so the
// model the image pinned is the model that runs. The graph pools inside the model, so each vector
// is its sentence_embedding output, normalised to unit length.
export async function startONNXEncoder(modelDir: string): Promise<ONNXEncoder> {
  // a dynamic import loads the native runtime only for the process that runs the encoder
  const ort = await import('onnxruntime-node');

  const [tokenizerJSON, tokenizerConfig] = await Promise.all([
    readJSONObject(join(modelDir, 'tokenizer.json')),
    readJSONObject(join(modelDir, 'tokenizer_config.json')),
  ]);

  const tokenizer = new Tokenizer(tokenizerJSON, tokenizerConfig);

  // the session loads by path, so the runtime finds the .onnx_data weights beside the graph
  const session = await ort.InferenceSession.create(join(modelDir, 'onnx/model_quantized.onnx'), {
    executionProviders: ['cpu'],
    interOpNumThreads: 1,
  });

  // one text a run: the int8 graph quantizes each run by its largest values, so a text batched
  // with others encodes a little differently from the same text alone, and an item's vector would
  // depend on the items beside it in a rebuild
  const encodeText = async (text: string): Promise<Float32Array> => {
    const ids = buildModelIDs(tokenizer.encode(text).ids);
    const shape = [1, ids.length];

    const outputs = await session.run({
      input_ids: new ort.Tensor('int64', BigInt64Array.from(ids, BigInt), shape),
      attention_mask: new ort.Tensor('int64', new BigInt64Array(ids.length).fill(1n), shape),

      // every text is one segment, so each token's type is 0
      token_type_ids: new ort.Tensor('int64', new BigInt64Array(ids.length), shape),
    });

    const pooled = outputs['sentence_embedding'];

    if (pooled === undefined) {
      throw new Error('the encoder model has no sentence_embedding output');
    }

    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a float32 output tensor holds a Float32Array
    return normalizeVector(pooled.data as Float32Array);
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

// the prefix the model's card gives a query; a stored text takes none
const queryPrefix = 'Represent this sentence for searching relevant passages: ';

// the model reads at most 512 tokens, so a longer text keeps its first tokens and its closing
// separator token
const maxTokens = 512;

function buildModelIDs(ids: readonly number[]): readonly number[] {
  const last = ids.at(-1);

  return ids.length <= maxTokens || last === undefined
    ? ids
    : [...ids.slice(0, maxTokens - 1), last];
}

async function readJSONObject(path: string): Promise<object> {
  const value: unknown = await Bun.file(path).json();

  if (typeof value !== 'object' || value === null) {
    throw new Error(`${path} holds no JSON object`);
  }

  return value;
}

function normalizeVector(vector: Float32Array): Float32Array {
  const norm = Math.hypot(...vector);

  return norm === 0 ? vector : vector.map((value) => value / norm);
}
