// Loads one encoder for the real-turn runs and caches each vector, so the store as it stood at each
// turn can be rebuilt from vectors already made. `leaf-ir-q8` is the encoder nixie ships, run by the
// product adapter on the pinned model files; the rest run on transformers.js.
import { startONNXEncoder } from '../../../adapters/encoder-onnx/src/start-onnx-encoder.ts';
import type { Encoder } from '../../../modules/memory/src/types.ts';

const bgeQuery = 'Represent this sentence for searching relevant passages: ';

interface TransformersModel {
  model: string;
  dtype: 'fp32' | 'q8';
  pooling: 'cls' | 'mean';
  queryPrefix: string;
}

export const ENCODERS = {
  'leaf-ir-q8': null,
  'arctic-s-q8': { model: 'Snowflake/snowflake-arctic-embed-s', dtype: 'q8', pooling: 'cls', queryPrefix: bgeQuery },
  'bge-small': { model: 'Xenova/bge-small-en-v1.5', dtype: 'fp32', pooling: 'cls', queryPrefix: bgeQuery },
  minilm: { model: 'Xenova/all-MiniLM-L6-v2', dtype: 'fp32', pooling: 'mean', queryPrefix: '' },
} satisfies Record<string, TransformersModel | null>;

export type EncoderName = keyof typeof ENCODERS;

export interface TurnEncoder extends Encoder {
  readonly stop: () => Promise<void>;
}

export interface EncoderDirs {
  shipped: string;
  models: string;
}

export async function loadTurnEncoder(name: EncoderName, dirs: EncoderDirs): Promise<TurnEncoder> {
  const spec = ENCODERS[name];
  const base = spec === null ? await startONNXEncoder(dirs.shipped) : await loadTransformersEncoder(spec, dirs.models);
  const cache = new Map<string, Float32Array>();

  return {
    encode: async (texts, kind) => {
      const missing = [...new Set(texts.filter((text) => !cache.has(`${kind}\u0000${text}`)))];

      if (missing.length > 0) {
        const vectors = await base.encode(missing, kind);

        for (const [index, text] of missing.entries()) {
          const vector = vectors[index];

          if (vector !== undefined) {
            cache.set(`${kind}\u0000${text}`, vector);
          }
        }
      }

      return texts.map((text) => cache.get(`${kind}\u0000${text}`) ?? new Float32Array());
    },
    stop: () => base.stop(),
  };
}

async function loadTransformersEncoder(spec: TransformersModel, modelsDir: string): Promise<TurnEncoder> {
  const { env, pipeline } = await import('@huggingface/transformers');

  env.cacheDir = modelsDir;

  const extractor = await pipeline('feature-extraction', spec.model, { dtype: spec.dtype });

  return {
    // One text a run, as the shipped encoder does, so a vector never depends on its batch.
    encode: async (texts, kind) => {
      const vectors: Float32Array[] = [];

      for (const text of texts) {
        const output = await extractor(kind === 'query' ? `${spec.queryPrefix}${text}` : text, {
          normalize: true,
          pooling: spec.pooling,
        });

        vectors.push(Float32Array.from(output.data as ArrayLike<number>));
      }

      return vectors;
    },
    stop: () => extractor.dispose(),
  };
}
