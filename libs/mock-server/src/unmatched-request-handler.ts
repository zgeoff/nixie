import { HttpResponse, http, passthrough } from 'msw';

// MSW's own unhandled-request error never stops a request under Bun, so this last handler refuses
// what no other handler matched. No DNS answers the reserved .test domain, and a data URL holds its
// own contents, so neither reaches the network.
export const unmatchedRequestHandler = http.all('*', (info) => {
  const url = new URL(info.request.url);

  if (
    url.protocol === 'data:' ||
    ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname) ||
    url.hostname.endsWith('.test')
  ) {
    return passthrough();
  }

  return HttpResponse.error();
});
