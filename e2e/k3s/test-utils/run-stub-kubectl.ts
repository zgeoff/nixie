// Stands in for kubectl: it prints its arguments as a JSON line and then acts on its last one, as
// fail, stream or hang. With --replies <file> first, it prints only the reply that file maps its
// last argument to, as kubectl prints a file or a jsonpath result.
const args = process.argv.slice(2);

if (args[0] === '--replies') {
  const replies: Readonly<Record<string, string>> = await Bun.file(args[1] ?? '').json();
  const reply = replies[args.at(-1) ?? ''];

  if (reply === undefined) {
    process.stderr.write(`error: the stub has no reply for ${args.at(-1)}\n`);
    process.exit(1);
  }
  process.stdout.write(reply);
  process.exit(0);
}

process.stdout.write(`${JSON.stringify(args)}\n`);

const mode = args.at(-1);

if (mode === 'fail') {
  process.stderr.write('error: the server refused\n');
  process.exit(1);
}
if (mode === 'stream') {
  for (const line of ['line 1', 'line 2', 'line 3']) {
    process.stdout.write(`${line}\n`);

    // oxlint-disable-next-line no-await-in-loop -- each line arrives on its own, as a log stream's does
    await Bun.sleep(10);
  }
}
if (mode === 'hang') {
  setInterval(() => {}, 60_000);
}
