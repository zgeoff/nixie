import type { LoginFile } from './login-file-schema';
import { readLoginFile } from './read-login-file';
import { withLoginLock } from './with-login-lock';
import { writeLoginFile } from './write-login-file';

export type LoginChange = 'written' | 'replaced' | 'missing';

// Re-reads the file under the lock and writes only while its login is the one the caller read, so
// a refresh that ran across a new login never writes over it.
export function changeLoginFile(
  path: string,
  loginID: string,
  change: (held: LoginFile) => LoginFile,
): Promise<LoginChange> {
  return withLoginLock(path, async (): Promise<LoginChange> => {
    const held = await readLoginFile(path);

    if (held === null) {
      return 'missing';
    }

    if (held.loginID !== loginID) {
      return 'replaced';
    }

    await writeLoginFile(path, change(held));

    return 'written';
  });
}
