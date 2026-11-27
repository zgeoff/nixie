import { http } from 'msw';
import type { TwilioMessageList } from '../twilio-message-list-schema';
import { twilioAPIURL } from './twilio-api-url';
import { twilioStore } from './twilio-store';

const messagesURL = `${twilioAPIURL}/2010-04-01/Accounts/:accountSID/Messages.json`;
const pageLimit = 100;

export const twilioHandlers = [
  http.get(messagesURL, async (info) => {
    const request = info.request;

    const url = new URL(request.url);

    await twilioStore.requests.create({
      method: 'GET',
      authorization: request.headers.get('authorization') ?? '',
      search: url.search,
    });

    await twilioStore.hooks.onRequest?.();

    if (!isAuthorized(request, String(info.params['accountSID']))) {
      return answerError(401, 'Authenticate');
    }

    const to = url.searchParams.get('To');
    const from = url.searchParams.get('From');
    const day = url.searchParams.get('DateSent>=');
    const dayMs = day === null ? 0 : Date.parse(day);
    const pageSize = Math.min(Number(url.searchParams.get('PageSize') ?? pageLimit), pageLimit);
    const page = Number(url.searchParams.get('Page') ?? 0);

    const held = twilioStore.messages
      .findMany((query) => query.where({}))
      .filter(
        (message) =>
          (to === null || message.to === to) &&
          (from === null || message.from === from) &&
          !(day !== null && message.isQueued) &&
          message.sentAt >= dayMs,
      )
      .toSorted((left, right) => right.sentAt - left.sentAt);

    const slice = held.slice(page * pageSize, (page + 1) * pageSize);
    const hasNext = held.length > (page + 1) * pageSize;

    const next = new URLSearchParams(url.searchParams);

    next.set('Page', String(page + 1));

    return Response.json({
      messages: slice.map((message) => ({
        sid: message.sid,
        from: message.from,
        to: message.to,
        body: message.body,
        direction: message.direction,
        date_sent: message.isQueued ? null : new Date(message.sentAt).toUTCString(),
        date_created: new Date(message.sentAt).toUTCString(),
      })),
      next_page_uri: hasNext ? `${url.pathname}?${next.toString()}` : null,
    } satisfies TwilioMessageList);
  }),
  http.post(messagesURL, async (info) => {
    const request = info.request;

    await twilioStore.requests.create({
      method: 'POST',
      authorization: request.headers.get('authorization') ?? '',
    });

    await twilioStore.hooks.onRequest?.();

    if (!isAuthorized(request, String(info.params['accountSID']))) {
      return answerError(401, 'Authenticate');
    }

    // The root preload runs the web client's MSW server beside this one, and the request reaches
    // both, so a read of the body itself fails with ERR_BODY_ALREADY_USED.
    const text = await request.clone().text();

    const form = new URLSearchParams(text);

    const to = form.get('To') ?? '';
    const body = form.get('Body') ?? '';

    if (!/^\+[1-9]\d{6,14}$/u.test(to)) {
      return answerError(400, `The 'To' number ${to} is not a valid phone number.`);
    }

    const created = await twilioStore.messages.create({
      from: form.get('From') ?? '',
      to,
      body,
      direction: 'outbound-api',
    });

    return Response.json({ sid: created.sid }, { status: 201 });
  }),
];

function isAuthorized(request: Request, accountSID: string): boolean {
  const match = /^Basic (?<pair>\S+)$/u.exec(request.headers.get('authorization') ?? '');
  const pair = Buffer.from(match?.groups?.['pair'] ?? '', 'base64').toString('utf8');
  const separator = pair.indexOf(':');
  const keySID = pair.slice(0, separator);
  const secret = pair.slice(separator + 1);

  return (
    separator > 0 &&
    twilioStore.keys.findFirst((query) => query.where({ accountSID, keySID, secret })) !== undefined
  );
}

function answerError(status: number, message: string): Response {
  return Response.json({ code: status, message, status }, { status });
}
