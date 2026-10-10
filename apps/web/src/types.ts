import type { ContractClient, Span, buildQueryUtils } from '@heynixie/contract';
import type { QueryClient } from '@tanstack/react-query';

export type QueryUtils = ReturnType<typeof buildQueryUtils>;

// What every view reaches nixie through: the oRPC client and its TanStack Query utils.
export interface NixieClient {
  readonly client: ContractClient;
  readonly queryUtils: QueryUtils;
}

export interface RouterContext extends NixieClient {
  readonly queryClient: QueryClient;
}

// A value the code reads and never changes, down to its nested arrays and objects. Functions and
// dates stay as they are.
export type ReadonlyDeep<T> = T extends Date | ((...args: readonly never[]) => unknown)
  ? T
  : { readonly [Key in keyof T]: ReadonlyDeep<T[Key]> };

// A message this device sends, kept on the device until the server confirms it.
export interface OutboxMessage {
  readonly clientMessageId: string;
  readonly spans: readonly Readonly<Span>[];
  readonly text: string;
  readonly thread: string;
}
