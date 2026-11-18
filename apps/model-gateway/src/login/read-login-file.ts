import { loginFileSchema } from './login-file-schema';
import type { LoginFile } from './login-file-schema';

// null when the file is gone
export async function readLoginFile(path: string): Promise<LoginFile | null> {
  const file = Bun.file(path);

  if (!(await file.exists())) {
    return null;
  }

  const text = await file.text();

  return loginFileSchema.parse(JSON.parse(text));
}
