import type { ReactNode } from 'react';
import { useFeatures } from '../features/use-features';

// Reads the same features query as a page, so its text shows when that query has an answer.
export function FeaturesProbe(): ReactNode {
  const features = useFeatures();

  return <p>{features === null ? 'features pending' : `features: ${features.join(',')}`}</p>;
}
