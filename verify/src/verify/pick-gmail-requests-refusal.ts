// A poll that ran with no google section shows in the requests that the fake Gmail answered, which
// no record of nixie's own can show.
export function pickGmailRequestsRefusal(requests: number, expected: number): string | null {
  return requests === expected
    ? null
    : `the fake Gmail answered ${requests} requests, not ${expected}`;
}
