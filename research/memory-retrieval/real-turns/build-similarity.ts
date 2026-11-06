export interface StoredShape {
  width: number | null;
  isInt8: boolean;
}

// The cosine similarity of two vectors as the product's vector index stores them: cut to the
// width, normalized, and, in int8, clamped to the stored range and rounded.
export function buildSimilarity(query: Float32Array, item: Float32Array, shape: StoredShape): number {
  const first = toStoredVector(query, shape);
  const second = toStoredVector(item, shape);
  let sum = 0;

  for (const [position, value] of first.entries()) {
    sum += value * (second[position] ?? 0);
  }

  return sum;
}

const storedRange = 0.3;
const int8Max = 127;

function toStoredVector(vector: Float32Array, shape: StoredShape): Float32Array {
  const cut = vector.slice(0, shape.width ?? vector.length);
  const norm = Math.hypot(...cut) || 1;

  return cut.map((value) =>
    shape.isInt8 ? Math.round(Math.max(-1, Math.min(1, value / norm / storedRange)) * int8Max) * (storedRange / int8Max) : value / norm,
  );
}
