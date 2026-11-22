import type { WindowKind } from './types';

// The kind of window a class names: Chromium's class holds "chrom", and the terminal app's holds
// "xterm". Every other class is another window.
export function pickWindowKind(windowClass: string): WindowKind {
  if (windowClass.includes('chrom')) {
    return 'browser';
  }

  return windowClass.includes('xterm') ? 'terminal' : 'other';
}
