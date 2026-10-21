import { imageLimits } from '@heynixie/contract';
import { useCallback, useState } from 'react';

export interface AttachedImage {
  readonly id: string;
  readonly file: File;
}

export function useAttachedImages(normalizeImage: (image: File) => Promise<File>) {
  const [images, setImages] = useState<readonly AttachedImage[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [scaling, setScaling] = useState(0);

  const attach = useCallback(
    async (files: readonly File[]) => {
      const picked = files.filter((file) => isImageFile(file));

      if (picked.length === 0) {
        return;
      }

      setScaling((current) => current + 1);

      const scaled = await readScaledImages(picked, {
        normalizeImage,
        room: imageLimits.count - images.length,
      });

      setScaling((current) => current - 1);

      setImages((current) => [
        ...current,
        ...scaled.files
          .slice(0, imageLimits.count - current.length)
          .map((file) => ({ id: crypto.randomUUID(), file })),
      ]);

      setNotice(pickNotice(scaled));
    },
    [images.length, normalizeImage],
  );

  const remove = useCallback((id: string) => {
    setImages((current) => current.filter((image) => image.id !== id));
    setNotice(null);
  }, []);

  const clear = useCallback(() => {
    setImages([]);
    setNotice(null);
  }, []);

  return { attach, clear, images, isPending: scaling > 0, notice, remove };
}

// A HEIC photo from a phone's files can come with no type, so its name counts too.
function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || /\.hei[cf]$/iu.test(file.name);
}

interface ScaleOptions {
  readonly normalizeImage: (image: File) => Promise<File>;

  readonly room: number;
}

interface ScaledImages {
  readonly files: readonly File[];
  readonly unread: number;
  readonly over: number;

  readonly unscaled: number;
}

interface ScaledTally {
  readonly files: File[];
  unread: number;
  over: number;
}

async function readScaledImages(
  picked: readonly File[],
  options: ScaleOptions,
): Promise<ScaledImages> {
  const scaled: ScaledTally & { tried: number } = { files: [], unread: 0, over: 0, tried: 0 };

  for (const file of picked) {
    if (scaled.files.length >= options.room) {
      break;
    }

    scaled.tried += 1;

    const read = await options.normalizeImage(file).catch(() => null);

    updateScaledTally(scaled, read);
  }

  return {
    files: scaled.files,
    unread: scaled.unread,
    over: scaled.over,
    unscaled: picked.length - scaled.tried,
  };
}

function updateScaledTally(scaled: ScaledTally, read: File | null) {
  if (read === null) {
    scaled.unread += 1;
  } else if (read.size > imageLimits.bytes) {
    scaled.over += 1;
  } else {
    scaled.files.push(read);
  }
}

function pickNotice(scaled: ScaledImages): string | null {
  if (scaled.unread > 0) {
    return 'This browser could not read an image, so it was left out.';
  }

  if (scaled.over > 0) {
    return 'An image was still over 5 MB once scaled, so it was left out.';
  }

  if (scaled.unscaled > 0) {
    return `A message takes up to ${imageLimits.count} images.`;
  }

  return null;
}
