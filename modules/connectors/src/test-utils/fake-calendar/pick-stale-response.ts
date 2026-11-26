import type { FakeEventFacts } from './types';

// The 412 that Google answers when the call's `If-Match` is not the event's etag; null when it holds.
export function pickStaleResponse(facts: FakeEventFacts): Response | null {
  const expected = facts.call.request.headers.get('if-match');

  return expected !== null && expected !== facts.stored['etag']
    ? new Response('{"error":{"errors":[{"reason":"conditionNotMet"}]}}', { status: 412 })
    : null;
}
