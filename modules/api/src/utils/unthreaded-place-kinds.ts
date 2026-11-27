import { contactMarkedKnownCodec, placesRemovedCodec } from '@heynixie/policy';
import { placeErasableKinds } from './place-erasable-kinds';

// The records of a place that carry no thread, because the directory belongs to no conversation, so
// a forget takes them with any conversation's thread. An act sits on its call's thread.
export const unthreadedPlaceKinds = [
  ...placeErasableKinds,
  placesRemovedCodec.kind,
  contactMarkedKnownCodec.kind,
] as const;
