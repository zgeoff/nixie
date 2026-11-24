import type { DirectResult } from '@heynixie/tools';
import { collectImageProfiles } from './collect-image-profiles';
import type { DrawArguments } from './draw-arguments';
import type { ImageSize } from './image-size';
import { isImageSize, parseImageSize, pickNearestImageSize } from './image-size';
import type { ImageRow } from './image-tables';
import type { PickedProfile } from './pick-image-profile';
import { pickImageProfile } from './pick-image-profile';
import type { ImageEntry } from './read-image-entry';
import { readImageEntry } from './read-image-entry';
import { refuseImage } from './refuse-image';
import type { ImageToolOptions } from './types';

type ReadableImage = Extract<ImageEntry, { kind: 'ok' }>;

export type DrawSources =
  | { readonly kind: 'refused'; readonly refusal: DirectResult }
  | {
      readonly kind: 'ready';
      readonly args: DrawArguments;
      readonly picked: PickedProfile;

      // the size the provider draws at
      readonly size: ImageSize;
      readonly priceMicros: number;

      // the image an edit starts from, and whether its own size is one the provider draws at
      readonly source: ReadableImage | null;
      readonly sourceRow: ImageRow | null;
      readonly isSizeNative: boolean;
      readonly references: readonly ReadableImage[];
    };

// What a draw reads before anything is charged: the images it names, the profile and the size. A
// refusal here costs nothing.
export async function readDrawSources(
  options: ImageToolOptions,
  args: DrawArguments,
): Promise<DrawSources> {
  const from = args.from === undefined ? null : await readImageEntry(options.log, args.from);

  const references = await Promise.all(
    args.references.map((id) => readImageEntry(options.log, id)),
  );

  const unreadable = pickUnreadableImage(args, from, references);

  if (unreadable !== null) {
    return { kind: 'refused', refusal: unreadable };
  }

  const picked = pickImageProfile(options, args.profile);

  if (picked === null) {
    return {
      kind: 'refused',
      refusal: refuseImage(
        'UNKNOWN_PROFILE',
        `No image profile ${args.profile ?? options.images.default} exists. Pick one of profiles.`,
        { rest: { profiles: collectImageProfiles(options.images) } },
      ),
    };
  }

  const unsupported = pickUnsupportedEdit(picked, args);

  if (unsupported !== null) {
    return { kind: 'refused', refusal: unsupported };
  }

  const source = from?.kind === 'ok' ? from : null;
  const readable = references.filter((entry) => entry.kind === 'ok');
  const sourceSize = source === null ? null : parseImageSize(source.row.size);

  const size =
    source === null ? (args.size ?? '1024x1024') : pickEditSize(source.row.size, sourceSize);

  return {
    kind: 'ready',
    args,
    picked,
    size,
    priceMicros: picked.profile.prices[size],
    source,
    sourceRow: source?.row ?? null,
    isSizeNative: source === null || isImageSize(source.row.size),
    references: readable,
  };
}

function pickUnreadableImage(
  args: DrawArguments,
  from: ImageEntry | null,
  references: readonly ImageEntry[],
): DirectResult | null {
  const named = [
    ...(from === null || args.from === undefined
      ? []
      : [{ label: 'from', id: args.from, entry: from }]),
    ...references.map((entry, index) => ({
      label: 'reference',
      id: args.references[index] ?? '',
      entry,
    })),
  ];

  for (const item of named) {
    if (item.entry.kind === 'missing') {
      return refuseImage('UNKNOWN_IMAGE', `The ${item.label} ${item.id} is no image.`);
    }

    if (item.entry.kind === 'forgotten') {
      return refuseImage('IMAGE_FORGOTTEN', `The image ${item.id} was forgotten.`);
    }
  }

  return null;
}

function pickUnsupportedEdit(picked: PickedProfile, args: DrawArguments): DirectResult | null {
  if (args.from !== undefined && !picked.provider.takes.source) {
    return refuseImage('NO_EDIT', `The profile ${picked.key} takes no image to edit.`);
  }

  if (args.references.length > 0 && !picked.provider.takes.references) {
    return refuseImage('NO_EDIT', `The profile ${picked.key} takes no references.`);
  }

  return null;
}

function pickEditSize(stored: string, dimensions: ReturnType<typeof parseImageSize>): ImageSize {
  if (isImageSize(stored)) {
    return stored;
  }

  return dimensions === null ? '1024x1024' : pickNearestImageSize(dimensions);
}
