import { http } from 'msw';
import { browserCookies } from './browser-cookies';
import { runMockAPIRequest } from './run-mock-api-request';
import { webOrigin } from './web-origin';

// The browser's calls to /rpc on its own origin, answered by the mock API. The handler sends the
// jar's cookies with each call and keeps what the response sets, as a browser would.
export const handlers = [
  http.all(`${webOrigin}/rpc/*`, async (info) => {
    const headers = new Headers(info.request.headers);
    const cookie = [...browserCookies].map(([name, value]) => `${name}=${value}`).join('; ');

    if (cookie !== '') {
      headers.set('cookie', cookie);
    }

    const response = await runMockAPIRequest(new Request(info.request, { headers }));

    for (const setCookie of response.headers.getSetCookie()) {
      const [name, value] = (setCookie.split(';')[0] ?? '').split('=');

      if (name !== undefined && value !== undefined) {
        browserCookies.set(name, value);
      }
    }

    return response;
  }),
];
