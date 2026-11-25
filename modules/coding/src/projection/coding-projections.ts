import type { Projection } from '@heynixie/log';
import { codingSessionIDsProjection } from './coding-session-ids-projection';
import { codingSessionsProjection } from './coding-sessions-projection';

export const codingProjections: readonly Projection[] = [
  codingSessionsProjection,
  codingSessionIDsProjection,
];
