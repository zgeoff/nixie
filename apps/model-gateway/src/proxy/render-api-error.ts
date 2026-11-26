// `fields` go in the error object beside its type and message, such as a refusal's counter and route
export function renderAPIError(
  status: number,
  type: string,
  message: string,
  fields: Readonly<Record<string, string>> = {},
): Response {
  return Response.json({ type: 'error', error: { type, ...fields, message } }, { status });
}
