import type { CallRuntime } from '../types';

export function buildCallRuntime(): CallRuntime {
  return {
    watches: new Map(),
    handOffs: new Map(),
    smallTalk: new Map(),
    hangUps: new Set(),
    reconnects: new Map(),
  };
}
