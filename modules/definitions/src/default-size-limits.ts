import type { SizeLimits } from './types';

export const defaultSizeLimits: SizeLimits = {
  maxFileBytes: 1024 * 1024,
  maxTotalBytes: 10 * 1024 * 1024,
};
