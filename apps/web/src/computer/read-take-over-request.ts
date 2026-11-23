import { takeOverRequestKey } from './constants';

// Returns whether the banner asked for a take-over, and clears the mark so a refresh starts none.
export function readTakeOverRequest(): boolean {
  try {
    const isRequested = globalThis.sessionStorage.getItem(takeOverRequestKey) === 'on';

    globalThis.sessionStorage.removeItem(takeOverRequestKey);

    return isRequested;
  } catch {
    return false;
  }
}
