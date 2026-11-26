import { expect, test } from 'bun:test';
import { openGooglePicker } from '../connection/open-google-picker';
import { requestPickerToken } from '../connection/request-picker-token';
import { stubGooglePicker } from './stub-google-picker';

test('it answers a token request with the scope given, and records what the page asked for', async () => {
  const stubbed = stubGooglePicker({ scope: 'scope-a', picked: [] });

  const answer = await requestPickerToken({ clientID: 'client-1', account: 'me@example.test' });

  expect([answer, stubbed.tokenRequests[0]]).toMatchObject([
    { accessToken: 'browser-token', scope: 'scope-a' },
    { client_id: 'client-1', include_granted_scopes: false, login_hint: 'me@example.test' },
  ]);
});

test('it answers the picker with the IDs given, and records the key and app it opened with', async () => {
  const stubbed = stubGooglePicker({ scope: 'x', picked: ['a1', 'b2'] });

  const files = await openGooglePicker({ token: 't', pickerKey: 'key-1', projectNumber: '123456' });

  expect([files, stubbed.openings]).toStrictEqual([
    ['a1', 'b2'],
    [{ token: 't', key: 'key-1', appID: '123456' }],
  ]);
});
