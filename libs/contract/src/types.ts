import type {
  ContractRouterClient,
  InferContractRouterInputs,
  InferContractRouterOutputs,
} from '@orpc/contract';
import type { contract } from './contract';
import type { hostContract } from './host-contract';
import type { imageLimits } from './image-limits';

export type ContractClient = ContractRouterClient<typeof contract>;

export type ContractInputs = InferContractRouterInputs<typeof contract>;

export type ContractOutputs = InferContractRouterOutputs<typeof contract>;

export type HostContractClient = ContractRouterClient<typeof hostContract>;

export type HostContractInputs = InferContractRouterInputs<typeof hostContract>;

export type LogRecord = ContractOutputs['conversation']['read']['records'][number];

export type Span = ContractInputs['conversation']['send']['spans'][number];

export type SpanSource = Span['source'];

export interface SpanState {
  readonly spans: readonly Span[];
  readonly text: string;

  readonly removed?: { readonly at: number; readonly text: string };
}

export interface PendingInput {
  readonly selection: {
    readonly backward: boolean;
    readonly end: number;
    readonly start: number;
  };
  readonly source: SpanSource;

  readonly respacing?: string;
}

export type ImageMediaType = (typeof imageLimits.mediaTypes)[number];
