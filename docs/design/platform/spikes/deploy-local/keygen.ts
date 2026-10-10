// Writes a new age identity to the path given and prints its recipient. The second argument picks
// the kind: x25519 for the host key, hybrid for the owner's post-quantum recovery key.

/* oxlint-disable one-var -- the arguments are checked before the key is made */
import {
  generateHybridIdentity,
  generateX25519Identity,
  identityToRecipient,
} from 'age-encryption';

const [path, kind] = process.argv.slice(2);
if (!path || (kind !== 'x25519' && kind !== 'hybrid')) {
  throw new Error('usage: bun keygen.ts <path> <x25519|hybrid>');
}
const identity =
    kind === 'hybrid' ? await generateHybridIdentity() : await generateX25519Identity(),
  recipient = await identityToRecipient(identity);
await Bun.write(path, `# recipient: ${recipient}\n${identity}\n`, { mode: 0o600 });
console.log(recipient);
