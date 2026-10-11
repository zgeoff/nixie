// Stands in for sops: `run-stub-sops.ts decrypt --output-type json <file>` prints the file's
// plaintext YAML as JSON, as sops prints a decrypted file, and exits 1 with a message on stderr
// for a file it cannot read, as sops does.
const [command, flag, format, path] = process.argv.slice(2);

if (command !== 'decrypt' || flag !== '--output-type' || format !== 'json' || path === undefined) {
  process.stderr.write('usage: decrypt --output-type json <file>\n');
  process.exit(2);
}
try {
  const text = await Bun.file(path).text();
  const json = JSON.stringify(Bun.YAML.parse(text));

  process.stdout.write(json);
} catch (error) {
  process.stderr.write(`Error decrypting file: ${String(error)}\n`);
  process.exit(1);
}
