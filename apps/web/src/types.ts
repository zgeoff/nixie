import type { ContractClient, ContractOutputs, Span, buildQueryUtils } from '@heynixie/contract';
import type { QueryClient } from '@tanstack/react-query';

type QueryUtils = ReturnType<typeof buildQueryUtils>;

// What every view reaches nixie through: the oRPC client and its TanStack Query utils.
export interface NixieClient {
  readonly client: ContractClient;
  readonly queryUtils: QueryUtils;
}

export interface RouterContext extends NixieClient {
  readonly queryClient: QueryClient;
}

// A value the code reads and never changes, down to its nested arrays and objects. Functions,
// dates and unknown values stay as they are.
export type ReadonlyDeep<T> = unknown extends T
  ? T
  : T extends Date | ((...args: readonly never[]) => unknown)
    ? T
    : { readonly [Key in keyof T]: ReadonlyDeep<T[Key]> };

// A message this device sends, kept on the device until the server confirms it.
export interface OutboxMessage {
  readonly clientMessageId: string;
  readonly spans: readonly Readonly<Span>[];
  readonly text: string;
  readonly thread: string;

  // the browser's IANA time zone when you wrote the message, so a retry carries the same zone
  readonly timeZone?: string | undefined;

  // when you wrote the message, as an ISO 8601 UTC time, kept through every retry and reload; a
  // message stored before the outbox kept it lacks it
  readonly writtenAt?: string | undefined;

  // the images attached to the message, each already scaled and re-encoded on the device
  readonly images?: readonly File[] | undefined;

  // how many images the device keeps for the message that it has not read back, so no send goes
  // without them
  readonly unreadImages?: number | undefined;
}

// A memory item as the memory view lists it, and one version of an item's history.
export type MemoryItem = ContractOutputs['memory']['listItems']['items'][number];

// what a forget's confirmation shows: the item with every version, and what its forget destroys
export type ForgetPreview = ReadonlyDeep<ContractOutputs['memory']['previewForget']>;

export type MemoryVersion = ReadonlyDeep<ContractOutputs['memory']['readItem']['versions'][number]>;

// A pending memory proposal as the proposals screen lists it, and the outcome of one answer to it.
export type MemoryProposal = ReadonlyDeep<
  ContractOutputs['memory']['listProposals']['proposals'][number]
>;

export type ProposalOutcome = ReadonlyDeep<
  ContractOutputs['memory']['approveProposals']['outcomes'][number]
>;
