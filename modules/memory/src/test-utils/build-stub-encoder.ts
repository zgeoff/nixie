import type { Encoder } from '../types';

const topicWidth = 16;

export function buildStubEncoder(topics: readonly (readonly string[])[]): Encoder {
  return {
    encode: (texts) =>
      Promise.resolve(
        texts.map((text) => {
          const words = new Set(text.toLowerCase().match(/[\p{L}\p{N}]+/gu));

          const named = topics.map((topic) => topic.some((word) => words.has(word.toLowerCase())));

          const vector = Float32Array.from({ length: topics.length * topicWidth }, (_, index) =>
            named[Math.floor(index / topicWidth)] === true ? 1 : 0,
          );

          const norm = Math.hypot(...vector);

          return norm === 0 ? vector : vector.map((value) => value / norm);
        }),
      ),
  };
}
