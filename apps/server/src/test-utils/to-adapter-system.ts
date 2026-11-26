// Adapters whose last folder word names no outside service: `live` of OpenAI's GPT-Live, and
// `gateway` of nixie's own model-gateway app, which is core.
const systemOverrides: Readonly<Record<string, string>> = {
  'speech-gpt-live': 'gpt-live',
  'spend-model-gateway': 'model-gateway',
};

// The outside service an adapter reaches: the last segment of its folder name
// `<interface>-<system>`, such as `github` from `definitions-repo-github`.
export function toAdapterSystem(folder: string): string {
  return systemOverrides[folder] ?? folder.split('-').at(-1) ?? folder;
}
