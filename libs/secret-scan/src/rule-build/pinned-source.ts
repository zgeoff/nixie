// The upstream rule set that the generated rule file comes from. The builder and the pin check
// both read this one constant.
export const pinnedSource = {
  repository: 'betterleaks/betterleaks',
  tag: 'v1.9.0',
  commit: '81aff7a638638aae3a659845d089043e1d8fe9ac',
  rulesPath: 'config/betterleaks.toml',
  licensePath: 'LICENSE',
  rulesSha256: 'a8f553eb634ac3c5c1ca3f0dc95e2b8abdea7d14b622604c5af07f30ce7926ef',
} as const;
