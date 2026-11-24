import type { ImageName } from './image-names.ts';
import { imageSizeBudgets } from './image-size-budgets.ts';

const bytesPerMiB = 1024 * 1024;

// Returns the failure message for an image over its budget, and null for one within it.
export function pickImageSizeVerdict(image: ImageName, sizeBytes: number): string | null {
  const budgetMiB = imageSizeBudgets[image];

  if (sizeBytes <= budgetMiB * bytesPerMiB) {
    return null;
  }

  return `${image} is ${Math.ceil(sizeBytes / bytesPerMiB)} MiB, over its ${budgetMiB} MiB budget`;
}
