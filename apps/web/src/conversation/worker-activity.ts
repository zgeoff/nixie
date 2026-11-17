import type { RecordRef, ToolActivity } from './build-activity';

export interface WorkerUsed {
  readonly dollars: number;
  readonly minutes: number;
  readonly tokens: number;
  readonly turns: number;
}

export interface WorkerTurnActivity {
  // the server cut the turn's text
  readonly isCut: boolean;

  // a forget erased the turn's text
  readonly isForgotten: boolean;
  readonly record: RecordRef;
  readonly dollars: number;
  readonly text?: string;
  readonly tokens: number;
  readonly turn: number;
}

export interface WorkerEndActivity {
  readonly detail?: string;
  readonly isCut: boolean;
  readonly limit?: string;
  readonly outcome: string;
  readonly record: RecordRef;
  readonly used: WorkerUsed;
}

export interface WorkerActivity {
  // the worker.run call that started the worker run
  readonly call: ToolActivity;

  // the worker's own tool calls
  readonly calls: readonly ToolActivity[];
  readonly end?: WorkerEndActivity;

  // the model ID of the profile the worker ran on
  readonly model?: string;
  readonly shortID?: string;
  readonly turns: readonly WorkerTurnActivity[];
  readonly workerRunID: string;
}
