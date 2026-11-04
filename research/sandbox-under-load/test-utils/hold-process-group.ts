import { startProcessGroup } from './start-process-group';

const group = startProcessGroup(
  ['sh', '-c', `while kill -0 ${process.ppid} 2> /dev/null; do sleep 0.05; done & wait`],
  { stdout: 'ignore', stderr: 'ignore' },
);

console.log(group.child.pid);
await group.child.exited;
