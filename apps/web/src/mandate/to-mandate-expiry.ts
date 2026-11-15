// The expiry the host takes, an instant with an offset, from the local date and time that a
// datetime-local input holds. An empty or unreadable value leaves the host's default, the next
// midnight in the owner's zone.
export function toMandateExpiry(text: string): string | undefined {
  if (text.trim() === '') {
    return undefined;
  }

  const at = new Date(text);

  return Number.isNaN(at.getTime()) ? undefined : at.toISOString();
}
