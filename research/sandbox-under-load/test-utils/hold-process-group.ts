// Starts a group whose leader starts a child, prints the leader's PID, and holds until a signal ends
// it, so a test can signal the process that started the group.
import { startProcessGroup } from './start-process-group';

const group = startProcessGroup(['sh', '-c', 'sleep 60 & wait'], {
  stdout: 'ignore',
  stderr: 'ignore',
});

console.log(group.child.pid);
await group.child.exited;
