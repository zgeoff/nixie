import type { ActionsWithCoding } from '../coding/add-coding-connectors';
import type { PhonePart } from './start-phone-part';

// The send's connector needs the provider, so the part adds it after the queue is built. Without a
// phone, the actions gain nothing.
export function addPhoneConnectors(
  actions: ActionsWithCoding,
  phone: PhonePart | null | undefined,
): ActionsWithCoding {
  if (phone === null || phone === undefined) {
    return actions;
  }

  return { ...actions, connectors: new Map([...actions.connectors, ...phone.connectors]) };
}
