// JSON parsers disagree on which of 2 values of one key wins, so the gateway could check one value
// while the model API reads the other. Each key is decoded before the compare, so an escaped spelling
// of a key counts as the same key. The text must be valid JSON.
export function hasDuplicateKey(text: string): boolean {
  const frames: (Set<unknown> | null)[] = [];
  let isKeyNext = false;
  let index = 0;

  while (index < text.length) {
    const char = text[index];

    if (char === '"') {
      const end = getStringEnd(text, index);
      const frame = frames.at(-1);

      if (isKeyNext && frame) {
        const key: unknown = JSON.parse(text.slice(index, end + 1));

        if (frame.has(key)) {
          return true;
        }

        frame.add(key);

        isKeyNext = false;
      }

      index = end + 1;
      continue;
    }

    if (char === '{') {
      frames.push(new Set());

      isKeyNext = true;
    } else if (char === '[') {
      frames.push(null);

      isKeyNext = false;
    } else if (char === '}' || char === ']') {
      frames.pop();

      isKeyNext = false;
    } else if (char === ',') {
      isKeyNext = frames.at(-1) instanceof Set;
    }

    index += 1;
  }

  return false;
}

function getStringEnd(text: string, start: number): number {
  let index = start + 1;

  while (text[index] !== '"') {
    index += text[index] === '\\' ? 2 : 1;
  }

  return index;
}
