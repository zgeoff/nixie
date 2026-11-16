import type { Labels } from '../types';

export function collectLabelTexts(labels: Labels): readonly string[] {
  return [labels.gist, labels.topic, ...labels.triggers];
}
