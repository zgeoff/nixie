import { expect, test } from 'bun:test';
import { pickGmailRequestsRefusal } from './pick-gmail-requests-refusal';

test('#pickGmailRequestsRefusal accepts the expected count', () => {
  expect(pickGmailRequestsRefusal(0, 0)).toBeNull();
});

test('#pickGmailRequestsRefusal refuses a poll that read the account', () => {
  expect(pickGmailRequestsRefusal(3, 0)).toBe('the fake Gmail answered 3 requests, not 0');
});
