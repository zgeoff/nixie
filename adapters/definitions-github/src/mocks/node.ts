import { setupServer } from 'msw/node';
import { githubHandlers } from './github-handlers';

export const server = setupServer(...githubHandlers);
