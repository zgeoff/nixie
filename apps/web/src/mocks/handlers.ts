import { http } from 'msw';
import { browserCookies } from './browser-cookies';
import { runMockAPIRequest } from './run-mock-api-request';
import { webOrigin } from './web-origin';

export const handlers = [
  http.all(`${webOrigin}/rpc/*`, async (info) => {
    // Bun's Headers drops the multipart content type of msw's request when it copies its headers
    // whole, so the handler copies them one entry at a time.
    const headers = new Headers([...info.request.headers]);

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
