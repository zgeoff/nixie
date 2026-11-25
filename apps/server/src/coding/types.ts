import type { ServerParts } from '../types';
import type { ServerCoding } from './build-server-coding';

export interface CodingToolsContext {
  readonly apiContext: ServerParts['apiContext'];
  readonly coding: ServerCoding | null;
}
