# mcp-servers

Contents: [Journey](#journey), [End state](#end-state).

Settings → MCP servers lists each outside MCP server that nixie proxies, with its state, its
sign-in, its health and its tools. The user approves the server, presses Connect, signs in on the
server's own page, and allows each tool the server lists.

Follow the steps in [Check a change](../SKILL.md#check-a-change) for this journey. Read that section
for the targets `local` and `preview`, the commands `up` and `done`, and the `data` field of each
command's JSON output.

When a command fails, do what its row in [Exit codes](exit-codes.md) says.

Run this journey on `local` only, on an `up` of its own:

- On `local`, `NIXIE_VERIFY_MCP=1 bun verify up` runs a test build of nixie with the server
  `tracker` in its config. The server is a stand-in MCP server on a loopback port, with its own
  authorization server, and it lists one tool, `lookup`. Its sign-in page approves at once.
- On `preview`, skip this journey, and list the feature as not verified there in your reply.

Approving a server takes a passkey, which a journey cannot give. Answer the cards with the action
`approve-held-mcp`, which answers as nixie's host command does.

Before you start:

- Run `NIXIE_VERIFY_MCP=1 bun verify up --restart` and `bun verify doctor`, then
  [sign-in-enrol](feature-sign-in-enrol.md).
- Run this journey once per `up`, because the server joins once.

## Journey

1. Record the next commands under this feature, then open the page:

   ```bash
   bun verify use --feature mcp-servers
   bun verify browser goto /settings/mcp
   bun verify browser snapshot
   ```

   Expect: the heading "MCP servers" and one item, `tracker`, with the text "Held · Waiting for your
   approval · Healthy" and the link "Review the proposal to add this server". No button "Connect to
   tracker" shows.

2. Open the server's card among the approvals, check its fields, then approve it. For `<item_ref>`,
   pass the `ref` of the line in the first snapshot that holds "Connect to the MCP server tracker."
   and `[cursor=pointer]`. Take no other snapshot before the click, because each snapshot gives
   every element a new `ref`.

   ```bash
   bun verify browser goto /proposals
   bun verify browser snapshot --until-text 'Connect to the MCP server'
   bun verify browser click --ref '<item_ref>'
   bun verify browser snapshot
   bun verify action approve-held-mcp --label 'Add the server'
   bun verify browser goto /settings/mcp
   bun verify browser snapshot
   ```

   Expect: the first snapshot lists "Connect to the MCP server tracker." under "Always asks". After
   the click, the second snapshot shows the card with the fields `url` (the stand-in's loopback
   address ending in `/mcp`), `clientID`, `scopes` `read write`, `trusted` `no` and `privateRange`
   `127.0.0.0/8`, and a button "Add the server". `approve-held-mcp` returns `data.approved` of 1.
   The last snapshot shows "Added · Not signed in · Healthy", the button "Connect to tracker" and
   "No tools listed yet."

3. Press Connect. The browser goes to the stand-in's sign-in page, which sends it back to nixie's
   return route:

   ```bash
   bun verify browser click --role button --name 'Connect to tracker'
   bun verify browser snapshot --until-text 'Hidden'
   ```

   Expect: the snapshot's URL ends in `/settings/mcp`. The item `tracker` shows "Added · Signed in ·
   Healthy" and no Connect button. The list "Tools of tracker" holds one item, "tracker.lookup
   Hidden: waits for your approval".

4. Open the tool's card among the approvals, check its form, then approve it. For `<item_ref>`, pass
   the `ref` of the line in the first snapshot that holds "Allow the tool tracker.lookup" and
   `[cursor=pointer]`. Take no other snapshot before the click.

   ```bash
   bun verify browser goto /proposals
   bun verify browser snapshot --until-text 'Allow the tool'
   bun verify browser click --ref '<item_ref>'
   bun verify browser snapshot
   bun verify action approve-held-mcp --label 'Allow the tool'
   bun verify browser goto /settings/mcp
   bun verify browser snapshot --until-text 'Allowed'
   bun verify browser screenshot
   bun verify db query "select state from mcp_servers"
   bun verify db query "select json_extract(payload, '$.outcome') as outcome from records where kind = 'proposals.settled' and json_extract(payload, '$.family') = 'mcp'"
   bun verify db query "select state from proposals where family = 'mcp'"
   ```

   Expect: the first snapshot lists "Allow the tool tracker.lookup in the form the server lists
   now." under "Routine". After the click, the second snapshot shows the card with the field
   `newForm`, whose JSON holds the name `lookup`, the description "Look up an issue by its number"
   and the input property `number`, the fields `effects` `read` and `declaredBy` "the tool
   annotations", and a button "Allow the tool". `approve-held-mcp` returns `data.approved` of 1. The
   last snapshot shows "tracker.lookup Allowed". The first query lists one row, `added`. The second
   lists the `approved` settlement of each `mcp` proposal, one for the server of step 2 and one for
   the tool. The third lists the same 2 rows of `proposals`, each `approved`. The screenshot is
   evidence for the reviewer.

## End state

- Step 1: the server is held, with no Connect button, and a link to its proposal.
- Step 2: the opened card shows each fact the approval widens, and approving it adds the server with
  no sign-in.
- Step 3: the return route sends the browser back to the page, the server is signed in and healthy,
  and its one tool waits for approval.
- Step 4: the opened card shows the whole form and the effects, and approving it shows the tool as
  allowed.

Once the end state matches, run `bun verify done`.
