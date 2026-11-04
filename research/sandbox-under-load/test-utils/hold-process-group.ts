import { startProcessGroup } from './start-process-group';

const group = startProcessGroup(['sh', '-c', 'sleep 60 & wait'], {
  stdout: 'ignore',
  stderr: 'ignore',
});

console.log(group.child.pid);
await group.child.exited;
