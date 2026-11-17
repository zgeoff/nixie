// The one path filter a grant holds when the model gateway is set. A model grant reaches only its
// own route, so the broker adds the credential to no other route.
export function buildGrantPath(sandboxID: string, route: string): string {
  return `/${sandboxID}/${route}/**`;
}
