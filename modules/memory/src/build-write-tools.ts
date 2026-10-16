import type { ToolDefinition } from '@heynixie/tools';
import { buildAnswerOfferTool } from './build-answer-offer-tool';
import { buildEditTool } from './build-edit-tool';
import { buildOfferImageTool } from './build-offer-image-tool';
import { buildRememberTool } from './build-remember-tool';
import { buildRetireTool } from './build-retire-tool';
import type { ModelWriteStore } from './gate-types';
import type { ItemIDStore } from './types';

// Builds the model's memory write tools: remember, edit and retire, each behind its gate, then the
// image offer and its answer, which save only on the owner's typed yes.
export function buildWriteTools(memory: ModelWriteStore & ItemIDStore): readonly ToolDefinition[] {
  return [
    buildRememberTool(memory),
    buildEditTool(memory),
    buildRetireTool(memory),
    buildOfferImageTool(memory),
    buildAnswerOfferTool(memory),
  ];
}
