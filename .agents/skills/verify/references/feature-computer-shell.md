# computer-shell

Contents: [Journey](#journey), [End state](#end-state).

The user asks the assistant to write a file on its computer and read it back. On `local`, a scripted
model answers in place of the real one. It calls `computer.write_file`, then `computer.read_file` on
the same path. nixie runs both in the shell of the computer sandbox. The shell keeps its files under
`~/files` on the sandbox's disk, which the browser's profile shares, and only the terminal account
can read them.

Follow the steps in [Check a change](../SKILL.md#check-a-change) for this journey. Read that section
for the commands `up` and `done`, and for the `data` field of each command's JSON output.

Run this journey on `local` only. The `use-computer` action exists only in `local`'s test build. On
`preview`, skip the journey and run no `done`. In your reply, list the feature as not verified
because it needs `local`.

This journey does not check that the shell's network is closed. In a deployment, each command runs
in the computer sandbox, in a network namespace that holds only a loopback and reaches sites through
a proxy. `local`'s test build runs the shell as a plain process of the host's user.

Before you start:

- When you have not run [sign-in-enrol](feature-sign-in-enrol.md) since `up`, run it first.
- Run this journey once per `up`, before [computer-browser](feature-computer-browser.md). Each
  result holds `isDiskNew`, which is true when the computer's disk was empty. The browser and the
  shell share that disk, so only the first computer call after `up` finds it empty. The end state
  needs that call to be this journey's write. When computer-browser ran first, or before you run
  this journey again, even after a failed journey, run `bun verify up --restart` and
  `bun verify doctor`. Then run sign-in-enrol.

## Journey

1. Record every later command of this journey under this feature:

   ```bash
   bun verify use --feature computer-shell
   ```

2. Send the user's message and script the model's turn. `use-computer --kind shell` sends the
   message "Write a note on your computer and read it back.", and queues 3 replies: a
   `computer.write_file` call that writes "hello from the shell" to `notes/hello.txt`, a
   `computer.read_file` call on that path, and the text in `--text`.

   ```bash
   bun verify action use-computer --kind shell --text 'The assistant wrote the note and read it back.'
   ```

   Expect: `data.replies` is 3.

3. Open the conversation page. Then wait for the turn: `conversation turn` waits up to 10 s for the
   message and the reply in the event log. Give `--reply` the same text as `--text` in step 2.

   ```bash
   bun verify browser goto /
   bun verify conversation turn --message 'Write a note on your computer and read it back.' --reply 'The assistant wrote the note and read it back.'
   ```

   Expect: `conversation turn` exits 0. On a failure, do what its row in [Exit codes](exit-codes.md)
   says.

4. Open the turn's tool calls on the page. Each snapshot gives every element a new `ref`, so take
   each `ref` from the snapshot just before its click.
   - In the first snapshot, the turn is one collapsed line. The page writes each tool's name with
     spaces, so the line's text starts with the word "conversation" and holds "computer write
     file:". It also has `[cursor=pointer]`. Pass its `ref`, such as `f3e66`, as `<turn_ref>`.
   - In the second snapshot, find the line that starts with `group "Tools 2"`. Pass its `ref` as
     `<tools_ref>`.

   ```bash
   bun verify browser snapshot
   bun verify browser click --ref '<turn_ref>'
   bun verify browser snapshot
   bun verify browser click --ref '<tools_ref>'
   bun verify browser snapshot
   ```

   Expect: every command exits 0. The last snapshot is the evidence for the end state.

## End state

The last snapshot of step 4 lists 2 tool calls under "Tools 2", each with its input and its result:

- `computer.write_file`, with the input
  `{ "path": "notes/hello.txt", "text": "hello from the shell" }`. Its result has
  `"isDiskNew": true`.
- `computer.read_file`, with the input `{ "path": "notes/hello.txt" }`. Its result has
  `"text": "hello from the shell"` and `"isDiskNew": false`.

Once the end state matches, run `bun verify done`.
