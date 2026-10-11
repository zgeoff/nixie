// Each candidate is one model run by one library. Prefixes follow each model card: some models embed
// a question with an instruction prefix and a stored text without one.

export type Runner = 'transformers' | 'ort-node' | 'ort-wasm' | 'fastembed' | 'static';

export interface Candidate {
  id: string;
  runner: Runner;
  model: string;
  dtype?: 'fp32' | 'q8' | 'fp16' | 'q4';
  pooling?: 'mean' | 'cls' | 'none';
  queryPrefix: string;
  docPrefix: string;
}

const BGE_QUERY = 'Represent this sentence for searching relevant passages: ';

export const CANDIDATES: Candidate[] = [
  {
    docPrefix: '',
    dtype: 'fp32',
    id: 'minilm',
    model: 'Xenova/all-MiniLM-L6-v2',
    pooling: 'mean',
    queryPrefix: '',
    runner: 'transformers',
  },
  {
    docPrefix: '',
    dtype: 'fp32',
    id: 'bge-small',
    model: 'Xenova/bge-small-en-v1.5',
    pooling: 'cls',
    queryPrefix: BGE_QUERY,
    runner: 'transformers',
  },
  {
    docPrefix: '',
    dtype: 'q8',
    id: 'bge-small-q8',
    model: 'Xenova/bge-small-en-v1.5',
    pooling: 'cls',
    queryPrefix: BGE_QUERY,
    runner: 'transformers',
  },
  {
    docPrefix: '',
    dtype: 'fp32',
    id: 'arctic-s-wasm',
    model: 'Snowflake/snowflake-arctic-embed-s',
    pooling: 'cls',
    queryPrefix: BGE_QUERY,
    runner: 'ort-wasm',
  },
  {
    docPrefix: '',
    id: 'bge-small-fastembed',
    model: 'fast-bge-small-en-v1.5',
    queryPrefix: BGE_QUERY,
    runner: 'fastembed',
  },
  {
    docPrefix: '',
    dtype: 'fp32',
    id: 'arctic-s',
    model: 'Snowflake/snowflake-arctic-embed-s',
    pooling: 'cls',
    queryPrefix: BGE_QUERY,
    runner: 'transformers',
  },
  {
    docPrefix: '',
    dtype: 'fp32',
    id: 'granite-r2',
    model: 'onnx-community/granite-embedding-small-english-r2-ONNX',
    pooling: 'cls',
    queryPrefix: '',
    runner: 'transformers',
  },
  {
    docPrefix: 'title: none | text: ',
    dtype: 'q8',
    id: 'gemma-q8',
    model: 'onnx-community/embeddinggemma-300m-ONNX',
    pooling: 'none',
    queryPrefix: 'task: search result | query: ',
    runner: 'transformers',
  },
  {
    docPrefix: '',
    id: 'potion-retrieval',
    model: 'minishlab/potion-retrieval-32M',
    queryPrefix: '',
    runner: 'static',
  },
  {
    docPrefix: '',
    dtype: 'q8',
    id: 'arctic-s-q8',
    model: 'Snowflake/snowflake-arctic-embed-s',
    pooling: 'cls',
    queryPrefix: BGE_QUERY,
    runner: 'transformers',
  },
  {
    docPrefix: '',
    dtype: 'fp32',
    id: 'arctic-xs',
    model: 'Snowflake/snowflake-arctic-embed-xs',
    pooling: 'cls',
    queryPrefix: BGE_QUERY,
    runner: 'transformers',
  },
  {
    docPrefix: '',
    dtype: 'q8',
    id: 'arctic-s-q8-wasm',
    model: 'Snowflake/snowflake-arctic-embed-s',
    pooling: 'cls',
    queryPrefix: BGE_QUERY,
    runner: 'ort-wasm',
  },
  {
    docPrefix: 'title: none | text: ',
    dtype: 'q4',
    id: 'gemma-q4',
    model: 'onnx-community/embeddinggemma-300m-ONNX',
    pooling: 'none',
    queryPrefix: 'task: search result | query: ',
    runner: 'transformers',
  },
  {
    docPrefix: '',
    id: 'potion-base-8m',
    model: 'minishlab/potion-base-8M',
    queryPrefix: '',
    runner: 'static',
  },
  {
    docPrefix: '',
    dtype: 'fp32',
    id: 'leaf-ir',
    model: 'MongoDB/mdbr-leaf-ir',
    pooling: 'none',
    queryPrefix: BGE_QUERY,
    runner: 'transformers',
  },
  {
    docPrefix: '',
    dtype: 'q8',
    id: 'leaf-ir-q8',
    model: 'MongoDB/mdbr-leaf-ir',
    pooling: 'none',
    queryPrefix: BGE_QUERY,
    runner: 'transformers',
  },
  {
    docPrefix: '',
    dtype: 'q8',
    id: 'leaf-ir-q8-ort',
    model: 'MongoDB/mdbr-leaf-ir',
    queryPrefix: BGE_QUERY,
    runner: 'ort-node',
  },
  {
    docPrefix: '',
    dtype: 'q8',
    id: 'arctic-s-q8-ort',
    model: 'Snowflake/snowflake-arctic-embed-s',
    pooling: 'cls',
    queryPrefix: BGE_QUERY,
    runner: 'ort-node',
  },
];
