import { mockComputerStream } from './mock-computer-stream';
import { mockImplementer } from './mock-implementer';
import { readMockHandover } from './read-mock-handover';
import { requireMockSession } from './require-mock-session';

export const mockComputerProcedures = {
  watch: mockImplementer.computer.watch.handler((options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    return {
      streamURL:
        mockComputerStream.url ?? `/rpc/computer/watch-stream?ticket=${crypto.randomUUID()}`,
    };
  }),
  readHandover: mockImplementer.computer.readHandover.handler((options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    return readMockHandover();
  }),
  takeOver: mockImplementer.computer.takeOver.handler((options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    return { takenOverAt: Date.now() };
  }),
  handBack: mockImplementer.computer.handBack.handler((options) => {
    requireMockSession(options.context.sessionToken, options.errors.UNAUTHORIZED);

    return { durationSeconds: 0 };
  }),
};
