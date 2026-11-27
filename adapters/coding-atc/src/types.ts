import type { ATCFleet } from './call/connect-atc';

// A session as atc-gateway lists it.
export type SessionEntry = Awaited<ReturnType<ATCFleet['session']['list']>>['sessions'][number];

// An event of the merged trail, as a read or the stream gives it.
export type TrailEvent = Awaited<ReturnType<ATCFleet['events']['read']>>['events'][number];
