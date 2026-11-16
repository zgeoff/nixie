export function renderAPIError(status: number, type: string, message: string): Response {
  return Response.json({ type: 'error', error: { type, message } }, { status });
}
