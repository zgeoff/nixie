// The one path filter a grant holds when the model gateway is set. A model grant reaches only its
// own route, so the broker adds the credential to no other route. Any other grant reaches the
// whole path of its sandbox.
export function buildGrantPath(sandboxID: string, route: string | null): string {
  return route === null ? `/${sandboxID}/**` : `/${sandboxID}/${route}/**`;
}
