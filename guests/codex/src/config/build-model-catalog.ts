import { codexEfforts } from '@heynixie/wire';

// One catalog entry for the profile's model. The bundled entry of a real model holds the MCP tools
// inside a script tool, so this entry names the model again with every tool switch off.
export function buildModelCatalog(model: string): { readonly models: readonly object[] } {
  return {
    models: [
      {
        slug: model,
        display_name: model,
        default_reasoning_level: 'medium',
        supported_reasoning_levels: codexEfforts.map((effort) => ({ effort, description: effort })),
        shell_type: 'unified_exec',
        visibility: 'list',
        supported_in_api: true,
        priority: 0,
        base_instructions: '',
        support_verbosity: true,
        tool_mode: null,
        experimental_supported_tools: [],
        apply_patch_tool_type: null,
        supports_search_tool: false,
        context_window: 272_000,
        truncation_policy: { mode: 'tokens', limit: 10_000 },
        input_modalities: ['text', 'image'],
      },
    ],
  };
}
