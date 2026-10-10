import type {
  ContractRouterClient,
  InferContractRouterInputs,
  InferContractRouterOutputs,
} from '@orpc/contract';
import type { contract } from './contract';

export type ContractClient = ContractRouterClient<typeof contract>;

export type ContractInputs = InferContractRouterInputs<typeof contract>;

export type ContractOutputs = InferContractRouterOutputs<typeof contract>;

export type LogRecord = ContractOutputs['conversation']['read']['records'][number];

export type Span = ContractInputs['conversation']['send']['spans'][number];

export type SpanSource = Span['source'];

// The text of a message box and how each span of it arrived. Spans cover the text in order, with
// no gap and no overlap.
export interface SpanState {
  readonly spans: readonly Span[];
  readonly text: string;
}

// What a client learns before an edit lands: the selection it replaces and how the new text
// arrives. A backward edit, such as a backspace, ends at the caret.
export interface PendingInput {
  readonly selection: {
    readonly backward: boolean;
    readonly end: number;
    readonly start: number;
  };
  readonly source: SpanSource;
}
