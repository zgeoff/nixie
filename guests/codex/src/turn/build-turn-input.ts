import type { InboxMessage } from '@heynixie/wire';

type UserInput =
  | { readonly type: 'text'; readonly text: string; readonly text_elements: readonly never[] }
  | { readonly type: 'localImage'; readonly path: string };

interface ImageFile {
  // relative to the working directory
  readonly name: string;
  readonly base64: string;
}

export interface TurnInput {
  readonly items: readonly UserInput[];
  readonly files: readonly ImageFile[];
}

const extensions = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
} as const;

// Builds the items of the turn's first message: each input message in order, with each image in
// place of its marker as a file in the working directory. An image whose marker the text lacks
// follows the text.
export function buildTurnInput(input: readonly InboxMessage[], workDir: string): TurnInput {
  const items: UserInput[] = [];
  const files: ImageFile[] = [];

  for (const message of input) {
    const unplaced: UserInput[] = [];
    let rest = message.text;

    for (const image of message.images ?? []) {
      const name = `image-${files.length + 1}.${extensions[image.mediaType]}`;
      const item: UserInput = { type: 'localImage', path: `${workDir}/${name}` };
      const at = rest.indexOf(image.marker);

      files.push({ name, base64: image.data });

      if (at === -1) {
        unplaced.push(item);
      } else {
        pushText(items, rest.slice(0, at));

        items.push(item);

        rest = rest.slice(at + image.marker.length);
      }
    }

    pushText(items, rest);

    items.push(...unplaced);
  }

  return { items, files };
}

function pushText(items: UserInput[], text: string): void {
  if (text !== '') {
    items.push({ type: 'text', text, text_elements: [] });
  }
}
