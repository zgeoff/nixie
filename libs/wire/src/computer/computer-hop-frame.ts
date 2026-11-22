import type { FetchHop } from '../utils/fetch-hop';

// Guest to server, before a request leaves the sandbox: the URL of the request, or the text of its
// headers and body, which the server scans for a secret.
export interface ComputerContentHop {
  readonly kind: 'hop-content';
  readonly text: string;
}

export type ComputerHopFrame = FetchHop | ComputerContentHop;
