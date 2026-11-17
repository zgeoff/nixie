// The broker sets its own credential header and the gateway passes the others on, so a request that
// holds both would reach the model API with a credential that the guest chose.
export function findHeaderRefusal(headers: Headers): string | null {
  if (headers.has('authorization') && headers.has('x-api-key')) {
    return 'the model gateway takes one credential header, so it refuses a request that holds both authorization and x-api-key';
  }

  return null;
}
