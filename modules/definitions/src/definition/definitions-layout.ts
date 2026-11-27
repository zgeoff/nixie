import { definitionSections } from '../section/definition-sections';

const coreFolders = new Set(['budgets', 'effects', 'mcp', 'prompts', 'rules', 'skills', 'tasks']);

export const definitionsLayout = {
  files: new Set(['nixie.yaml', 'persona.md']),

  // the core folders and the folder of each section that a feature adds
  isFolder: (name: string): boolean =>
    coreFolders.has(name) || definitionSections.list().some((section) => section.folder === name),
};
