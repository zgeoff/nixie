// The guest's home, which holds its session state. The sandbox sets it, and a guest without one
// stops, because the CLI would write its transcripts somewhere nixie never cleans.
export function getHome(env: Readonly<Record<string, string | undefined>>): string {
  const home = env['HOME'];

  if (home === undefined || home === '') {
    throw new Error('the conversation guest needs HOME');
  }
  return home;
}
