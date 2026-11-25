// The day's rate of one US dollar in Australian dollars, in the shape the rate source answers.
export function startFakeRateSite(): Bun.Server<undefined> {
  return Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    routes: {
      '/latest': () =>
        Response.json({ amount: 1, base: 'USD', date: '2026-11-25', rates: { AUD: 1.52 } }),
    },
    fetch: answerUnknownPath,
  });
}

function answerUnknownPath(): Response {
  return new Response(null, { status: 404 });
}
