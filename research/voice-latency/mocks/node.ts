import { setupServer } from 'msw/node';
import { decisionHandlers } from './decision-handlers.ts';

export const server = setupServer(...decisionHandlers);
