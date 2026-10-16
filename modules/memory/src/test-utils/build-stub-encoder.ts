import type { Encoder } from '../types';

// A stand-in for the local encoder that encodes meaning as topics: lists of words that mean the
// same thing. A text's unit vector is 1 over the numbers of each topic one of its words names, so
// paraphrases come out close, as the real model's do, and a query encodes as an item's text does.
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

// numbers a topic spans, so a unit vector's numbers stay inside the range the index stores, as the
// real model's small numbers do, and 16 topics fit in the numbers it keeps
const topicWidth = 16;
