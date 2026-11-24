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

5. Check that the shell shows only its own processes. `use-computer --kind shell-processes` sends
   the message "List the processes that your shell shows.", and queues 2 replies: a `computer.run`
   call of `ps -e -o args=` and the text in `--text`. nixie holds the command until the user
   approves it.

   ```bash
   bun verify action use-computer --kind shell-processes --text 'The assistant listed the processes.'
   bun verify proposals --tool computer.run --waiting pending
   bun verify action script-reply --text 'Thanks, I have the list.'
   ```

   Expect: `data.replies` is 2, and `proposals` exits 0.

6. Open the approvals page, and take a snapshot:

   ```bash
   bun verify browser goto /proposals
   bun verify browser snapshot
   ```

   Expect: one item that reads "Run computer.run (computer_run).". Pass the `ref` of the line that
   holds that text and `[cursor=pointer]` as `<item_ref>`.

7. Click the item to expand it, then click its button named "Run computer.run". Take the button's
   `ref` from the snapshot after the first click.

   ```bash
   bun verify browser click --ref '<item_ref>'
   bun verify browser snapshot
   bun verify browser click --ref '<button_ref>'
   ```

   Expect: both clicks exit 0.

8. Read the command's result on the conversation page. Take each `ref` from the snapshot just before
   its click, as in step 4: the collapsed line of the turn whose text holds "computer run:", then
   the line that starts with `group "Tools 1"`.

   ```bash
   bun verify browser goto /
   bun verify browser snapshot
   bun verify browser click --ref '<turn_ref>'
   bun verify browser snapshot
   bun verify browser click --ref '<tools_ref>'
   bun verify browser snapshot
   ```

   Expect: the `computer.run` result has `"exitCode": 0`, and its stdout lists only the bridge
   (`bridge-main.ts`), `ps -e -o args=` and the shell that runs it. Fail the journey on a nonzero
   exit code, on an empty list, and on any other line, such as a display server, a remote-screen
   socket path or a browser flag. The shell's own `/proc` is what keeps those lines out.

## End state

The last snapshot of step 4 lists 2 tool calls under "Tools 2", each with its input and its result:

- `computer.write_file`, with the input
  `{ "path": "notes/hello.txt", "text": "hello from the shell" }`. Its result has
  `"isDiskNew": true`.
- `computer.read_file`, with the input `{ "path": "notes/hello.txt" }`. Its result has
  `"text": "hello from the shell"` and `"isDiskNew": false`.

The last snapshot of step 8 shows the `computer.run` result with `"exitCode": 0` and only the 3
processes of the shell in its stdout.

Once the end state matches, run `bun verify done`.
