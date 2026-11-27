import { placesAddedCodec, placesChangedCodec } from '@heynixie/policy';

// The records of a place that hold its key or its name in their erasable fields. They carry no
// thread, because a place belongs to no conversation.
export const placeErasableKinds = [placesAddedCodec.kind, placesChangedCodec.kind] as const;
