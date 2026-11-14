export function getHome(env: Readonly<Record<string, string | undefined>>): string {
  const home = env['HOME'];

  if (home === undefined || home === '') {
    throw new Error('the conversation guest needs HOME');
  }

  return home;
}
