// The arguments to `bun` that compile the gateway binary a release publishes. The bundle lane's
// check compiles with the same arguments, so it starts the binary that a host runs.
export function buildGatewayCompileArgs(entry: string, outfile: string): string[] {
  return [
    'build',
    '--compile',
    '--target=bun-linux-x64',
    '--define',
    'NIXIE_TEST_BUILD=false',
    entry,
    '--outfile',
    outfile,
  ];
}
