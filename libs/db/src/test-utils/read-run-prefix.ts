import { readlink } from 'node:fs/promises';
import invariant from 'tiny-invariant';

export async function readRunPrefix(): Promise<string> {
  const link = await readlink('/proc/self/ns/pid');

  const namespace = /^pid:\[(?<id>\d+)\]$/u.exec(link)?.groups?.['id'];

  invariant(namespace !== undefined, `the PID namespace link reads ${link}`);

  return `pid${String(process.pid)}-ns${namespace}-`;
}
