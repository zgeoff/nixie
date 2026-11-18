import { useEffect, useState } from 'react';

// A URL for the blob, which the browser frees when the blob changes or the component leaves.
export function useBlobURL(blob: Blob | undefined): string | null {
  const [url, setURL] = useState<string | null>(null);

  useEffect(() => {
    const created = blob === undefined ? null : URL.createObjectURL(blob);

    setURL(created);

    return () => {
      if (created !== null) {
        URL.revokeObjectURL(created);
      }
    };
  }, [blob]);

  return url;
}
