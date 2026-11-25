import type { HostMail } from '../types';

export interface SentMemoryMail {
  readonly hostMessageID: string;
  readonly raw: Uint8Array;
}

// What a memory host keeps, which a host that starts again continues.
export interface MemoryHostState {
  readonly instance: string;
  readonly inbox: readonly HostMail[];
  readonly sent: readonly SentMemoryMail[];
}
