// Writes a prompt of about 600 KB, which the model counts as about 235k input tokens, to the path
// in the first argument.
const words = ['harbor', 'lantern', 'copper', 'meadow', 'quartz', 'willow', 'signal', 'ember'];
const targetBytes = 600_000;
const notes: string[] = [];
let lengthBytes = 0;

for (let index = 0; lengthBytes < targetBytes; index += 1) {
  const note = `Note ${index}: the ${words[index % 8]} near the ${words[(index * 7) % 8]} counted ${(index * 13) % 997} ${words[(index * 3) % 8]}s. `;

  notes.push(note);
  lengthBytes += note.length;
}

notes.push('\n\nQuestion: which word appears in note 4321? Answer in one line.');

await Bun.write(process.argv[2] ?? 'large-prompt.txt', notes.join(''));
