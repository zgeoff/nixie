import type { GPTLiveSession, SidebandSocket } from '../types';

export function buildGPTLiveSession(sessionID: string, socket: SidebandSocket): GPTLiveSession {
  return {
    sessionID,
    socket,
    queue: [],
    waiters: [],
    seenEventIDs: new Set(),
    requestSlices: [],
    heardSlices: [],
    talkSlices: [],
    lines: [],
    unacknowledged: 0,
    lastOutputAtMs: 0,
    nextEventNumber: 1,
    isClosed: false,
    isClosing: false,
    inputQuiet: { current: null },
    outputQuiet: { current: null },
    expiry: { current: null },
    stopping: new AbortController(),
  };
}
