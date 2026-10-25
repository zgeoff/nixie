// The model sees an event ID in a message stamp as #123, so it may pass the ID with its #.
export function toEventID(eventID: string): string {
  return eventID.trim().replace(/^#/u, '');
}
