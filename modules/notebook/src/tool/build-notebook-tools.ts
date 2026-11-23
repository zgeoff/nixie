import type { ToolDefinition } from '@heynixie/tools';
import { buildNotebookCheckTool } from './build-notebook-check-tool';
import { buildNotebookEditTool } from './build-notebook-edit-tool';
import { buildNotebookFindTool } from './build-notebook-find-tool';
import { buildNotebookForgetTool } from './build-notebook-forget-tool';
import { buildNotebookHistoryTool } from './build-notebook-history-tool';
import { buildNotebookLinkTool } from './build-notebook-link-tool';
import { buildNotebookReadTool } from './build-notebook-read-tool';
import { buildNotebookUnlinkTool } from './build-notebook-unlink-tool';
import { buildNotebookWalkTool } from './build-notebook-walk-tool';
import { buildNotebookWriteTool } from './build-notebook-write-tool';
import type { NotebookToolStore } from './notebook-tool-store';

// The 10 notebook tools. The tools read the store when a call runs, so the server builds them before
// the notebook starts.
export function buildNotebookTools(readStore: () => NotebookToolStore): readonly ToolDefinition[] {
  return [
    buildNotebookWriteTool(readStore),
    buildNotebookEditTool(readStore),
    buildNotebookReadTool(readStore),
    buildNotebookHistoryTool(readStore),
    buildNotebookFindTool(readStore),
    buildNotebookCheckTool(readStore),
    buildNotebookLinkTool(readStore),
    buildNotebookUnlinkTool(readStore),
    buildNotebookWalkTool(readStore),
    buildNotebookForgetTool(readStore),
  ];
}
