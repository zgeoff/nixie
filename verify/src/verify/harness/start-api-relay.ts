// An address that stays while the API behind it moves. The web server reads its API address once,
// and nixie starts again on a new port after a reset.
export function startAPIRelay(readAPIURL: () => string): Bun.Server<undefined> {
  const answerRelay = (request: Request): Promise<Response> => {
    const url = new URL(request.url);

    return fetch(new Request(`${readAPIURL()}${url.pathname}${url.search}`, request));
  };

  return Bun.serve({ port: 0, fetch: answerRelay });
}
