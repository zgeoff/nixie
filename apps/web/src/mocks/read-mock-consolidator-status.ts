import { store } from './store';

export function readMockConsolidatorStatus() {
  const [consolidator] = store.memoryConsolidator.all();

  return { isEnabled: consolidator?.isEnabled ?? true };
}
