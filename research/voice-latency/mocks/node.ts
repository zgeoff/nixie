import { setupServer } from 'msw/node';
import { datasetHandlers } from './dataset-handlers.ts';
import { decisionHandlers } from './decision-handlers.ts';

export const server = setupServer(...decisionHandlers, ...datasetHandlers);
