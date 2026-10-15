import { imageLimits } from '@heynixie/contract';
import { useCallback, useState } from 'react';

export interface AttachedImage {
  readonly id: string;
  readonly file: File;
}

// Holds the images attached to the message you are writing, each one the copy normalizeImage made,
// up to the most a message takes. An image that does not read, stays past the byte limit after
// scaling, or comes past the limit on count is left out, and the notice says why.
export function useAttachedImages(normalizeImage: (image: File) => Promise<File>) {
  const [images, setImages] = useState<readonly AttachedImage[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const attach = useCallback(
    async (files: readonly File[]) => {
      const picked = files.filter((file) => isImageFile(file));

      if (picked.length === 0) {
        return;
      }

      const results = await Promise.allSettled(picked.map((file) => normalizeImage(file)));

      const read = results.flatMap((result) =>
        result.status === 'fulfilled' ? [result.value] : [],
      );

      const fitting = read.filter((file) => file.size <= imageLimits.bytes);
      const room = imageLimits.count - images.length;

      setImages((current) => [
        ...current,
        ...fitting
          .slice(0, imageLimits.count - current.length)
          .map((file) => ({ id: crypto.randomUUID(), file })),
      ]);

      setNotice(
        pickNotice({ picked: picked.length, read: read.length, fitting: fitting.length, room }),
      );
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

  return { attach, clear, images, notice, remove };
}

// a HEIC photo from a phone's files can come with no type, so its name counts too
function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || /\.hei[cf]$/iu.test(file.name);
}

interface AttachCounts {
  readonly picked: number;
  readonly read: number;
  readonly fitting: number;
  readonly room: number;
}

function pickNotice(counts: AttachCounts): string | null {
  if (counts.read < counts.picked) {
    return 'This browser could not read an image, so it was left out.';
  }

  if (counts.fitting < counts.read) {
    return 'An image was still over 5 MB once scaled, so it was left out.';
  }

  if (counts.fitting > counts.room) {
    return `A message takes up to ${imageLimits.count} images.`;
  }

  return null;
}
