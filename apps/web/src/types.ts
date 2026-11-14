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

export type PauseCause = NonNullable<ContractOutputs['nixie']['read']['paused']>['cause'];

export type MemoryItem = ContractOutputs['memory']['listItems']['items'][number];

export type ForgetBackup = ReadonlyDeep<ContractOutputs['conversation']['forget']['backup']>;

export type ForgetPreview = ReadonlyDeep<ContractOutputs['memory']['previewForget']>;

export type RetiredForgetItem = ReadonlyDeep<
  ContractOutputs['memory']['previewForgetRetired']['items'][number]
>;

export type MemoryVersion = ReadonlyDeep<ContractOutputs['memory']['readItem']['versions'][number]>;

export type ApprovalItem = ReadonlyDeep<ContractOutputs['approvals']['listItems']['items'][number]>;

export type ApprovalRead = ReadonlyDeep<
  ContractOutputs['approvals']['readProposals']['proposals'][number]
>;

export type ApprovalBody = ApprovalItem['body'];

export type MemoryProposal = NonNullable<ApprovalBody['memory']>;

export type MemoryNotice = ReadonlyDeep<
  ContractOutputs['memory']['listNotices']['notices'][number]
>;

export type MemoryNoticeEntry = MemoryNotice['entries'][number];

export type MomentSummary = ReadonlyDeep<
  ContractOutputs['memory']['listMoments']['moments'][number]
>;

export type MomentDetail = ReadonlyDeep<ContractOutputs['memory']['readMoment']>;

export type MomentSpanRecord = ReadonlyDeep<
  ContractOutputs['memory']['readMomentSpan']['records'][number]
>;

export type MomentDestroyPreview = ReadonlyDeep<ContractOutputs['memory']['previewMomentDestroy']>;
