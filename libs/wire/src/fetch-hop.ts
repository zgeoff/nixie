// Guest to server, before the fetcher resolves the hop's host.
export interface FetchHop {
  readonly kind: 'hop';
  readonly url: string;
}

// Server to guest. The wire holds no refusal frame: the server stops the fetcher.
export interface FetchHopPass {
  readonly kind: 'hop-pass';
}
