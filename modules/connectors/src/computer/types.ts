import type { JSONObject } from '@heynixie/log';
import type { ComputerReply, ComputerRequest } from '@heynixie/wire';

export type ComputerKind = 'browser' | 'shell';

// the server's verdict on a URL a guest is about to request
export type ScanVerdict =
  | { readonly kind: 'pass' }
  | { readonly kind: 'refuse'; readonly reason: string };

export type ComputerScan = (url: string) => Promise<ScanVerdict>;

// A call ends in one of these. A guest's reply carries the reason a hop was refused, if one was.
export type CallResult =
  | { readonly status: 'reply'; readonly reply: ComputerReply; readonly refusal: string | null }

  // another call held the sandbox for the whole wait
  | { readonly status: 'busy' }

  // the kernel killed a process of the sandbox for memory during the call
  | { readonly status: 'out_of_memory' }

  // the sandbox or the guest broke, or the guest passed its time limit
  | { readonly status: 'failed'; readonly message: string };

export interface ComputerCall {
  readonly request: ComputerRequest;
  readonly scan: ComputerScan;

  // the longest the guest may take after its turn starts
  readonly timeoutMs: number;
}

// the tool and the arguments of a queued call, as its action holds them
export interface ComputerAttempt {
  readonly tool: string;
  readonly arguments: JSONObject;
}
