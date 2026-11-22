import { mockImplementer } from './mock-implementer';
import { requireMockSession } from './require-mock-session';

export const mockComputerProcedures = {
  watch: mockImplementer.computer.watch.handler((options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    return { streamURL: `/rpc/computer/watch-stream?ticket=${crypto.randomUUID()}` };
  }),
};
