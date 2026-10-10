import type { SizeLimits } from './types';

// 1 MiB per file and 10 MiB in all, far past any persona, job or rule file.
export const defaultSizeLimits: SizeLimits = {
  maxFileBytes: 1024 * 1024,
  maxTotalBytes: 10 * 1024 * 1024,
};
