interface FakeService {
  readonly serve: (request: Request) => Promise<Response | null>;
}

// The answer of the first fake service whose paths the request names; null when none does.
export async function serveFakeGoogle(
  request: Request,
  services: readonly FakeService[],
): Promise<Response | null> {
  for (const service of services) {
    // eslint-disable-next-line no-await-in-loop -- the first service that answers ends the loop
    const answered = await service.serve(request);

    if (answered !== null) {
      return answered;
    }
  }

  return null;
}
