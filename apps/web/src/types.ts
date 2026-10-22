import type { ContractClient, ContractOutputs, Span, buildQueryUtils } from '@heynixie/contract';
import type { QueryClient } from '@tanstack/react-query';

type QueryUtils = ReturnType<typeof buildQueryUtils>;

export interface NixieClient {
  readonly client: ContractClient;
  readonly queryUtils: QueryUtils;
}

export interface RouterContext extends NixieClient {
  readonly queryClient: QueryClient;
}

export type ReadonlyDeep<T> = unknown extends T
  ? T
  : T extends Date | ((...args: readonly never[]) => unknown)
    ? T
    : { readonly [Key in keyof T]: ReadonlyDeep<T[Key]> };

export interface OutboxMessage {
  readonly clientMessageId: string;
  readonly spans: readonly Readonly<Span>[];
  readonly text: string;
  readonly thread: string;

  readonly timeZone?: string | undefined;

  readonly writtenAt?: string | undefined;

  readonly images?: readonly File[] | undefined;

  readonly unreadImages?: number | undefined;
}

export type MemoryItem = ContractOutputs['memory']['listItems']['items'][number];

export type ForgetPreview = ReadonlyDeep<ContractOutputs['memory']['previewForget']>;

export type RetiredForgetItem = ReadonlyDeep<
  ContractOutputs['memory']['previewForgetRetired']['items'][number]
>;

export type MemoryVersion = ReadonlyDeep<ContractOutputs['memory']['readItem']['versions'][number]>;

export type MemoryProposal = ReadonlyDeep<
  ContractOutputs['memory']['listProposals']['proposals'][number]
>;

export type ProposalOutcome = ReadonlyDeep<
  ContractOutputs['memory']['approveProposals']['outcomes'][number]
>;

export type MemoryNotice = ReadonlyDeep<
  ContractOutputs['memory']['listNotices']['notices'][number]
>;

export type MemoryNoticeEntry = MemoryNotice['entries'][number];
