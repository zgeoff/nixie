interface ModelRequestBody {
  readonly tools?: readonly { readonly name: string }[];
}

// The `when` of a scripted reply that answers only a request offering this tool. The SDK and the
// consent checker send requests of their own beside a turn, and those offer none of nixie's tools.
export function makeHasTool(name: string): (body: ModelRequestBody) => boolean {
  return (body) => body.tools?.some((tool) => tool.name === name) === true;
}
