# sign-in-enrol

A browser with no session opens nixie on the "Enrol this browser" form. The user gets an enrolment
code from the host command `nixie enrol-code`, types it and a device name into the form, and presses
Enrol. The page then shows the conversation, and nixie lists a session with that device name.

Run this journey first, on the browser that `bun verify up` or `bun verify attach` just started:
once the browser has a session, the form never shows. When step 3 shows the conversation in place of
the form, start a new browser: on `local`, run `bun verify up --restart`; on `preview`, which you
never stop, run `bun verify detach`, then `bun verify attach`.

## Journey

1. Record the next commands under this feature:

   ```bash
   bun verify use --feature sign-in-enrol
   ```

2. Get an enrolment code.
   - On `preview`, run `bun verify action enrol-code`. Expect: the code in `data.code`.
   - On `local`, start `nixie enrol-code` in the target's terminal, and wait for the code it prints:

     ```bash
     bun verify terminal start enrol-code
     bun verify terminal wait --regex '[A-Z0-9]{5}-[A-Z0-9]{5}'
     ```

     Expect: the first match of the regex in `data.screen.text` is the code.

3. Open the app's start page:

   ```bash
   bun verify browser goto /
   bun verify browser snapshot
   ```

   Expect: the heading "Enrol this browser".

4. Fill the form, and press Enrol. Put the code from step 2 in place of `<code>`. On `preview`, an
   earlier session can hold the device name, so type a new one, such as `hallway tablet 2`, here and
   in step 5.

   ```bash
   bun verify browser type --role textbox --name 'Enrolment code' --value '<code>'
   bun verify browser type --role textbox --name 'Device name' --value 'hallway tablet'
   bun verify browser click --role button --name Enrol
   bun verify browser snapshot
   ```

   Expect: the textbox "Message", where the conversation starts.

5. Check that nixie lists the new session:

   ```bash
   bun verify sessions --device 'hallway tablet'
   ```

   Expect: exit 0.

## End state

- The snapshot of step 4 shows the textbox "Message", and no "Enrol this browser" heading.
- `bun verify sessions --device` exits 0, and `data.sessions` holds a session whose `deviceName` is
  the device name you typed.
