# Time

The time tool tells the model the current time in the user's time zone, so the model can answer
"what time is it" and work out what "today" means where the user is. Each message the model reads
also starts with the local time the user sent it. The user travels, so no fixed zone is right all
the time. Each message therefore carries the time zone of the device that sent it, and the tool
answers in the zone of the user's newest message that carries one. The
[API](../channels/api.md#sending-a-message) covers how a message is written, and
[tool calls](./tool-calls.md) covers the endpoint that runs the tool.

## The zone on each message

The web client reads the browser's IANA time zone, such as `Europe/London`, when the user writes a
message, and keeps it with the message in the outbox, so a retry sends the zone the message had when
the user wrote it. The API stores the zone in the `owner_message` record's payload, outside the
erasable fields, so any reader finds where the user was without the message's key, and the zone
stays readable after the message's text is forgotten.

The API stores only a zone that the server's time zone database contains. A browser can know a newer
zone than the server does, so the API leaves an unknown zone out of the record and writes the
message anyway, because a time zone is never worth losing a message over.

## The send time on each message

Every message from the user that the model reads starts with the time the user sent it, in the zone
the message carries, such as `[Tue 14 Oct, 14:05, Sydney]`, so the model can tell a late "goodnight"
from an early "good morning" and work out the gap between two messages itself. The stamp gives the
weekday, the day, the month, the hour and minute without am or pm, and the zone's city, and adds the
year only when the message came from an earlier year than the current one in that zone. A message
that carries no zone uses the default zone from the deployment configuration. The inbox and a
rebuilt session's history render the stamp the same way. In that history each reply keeps its own
time in UTC, labelled so, because a reply carries no zone and an unlabelled time would read as the
user's clock.

The stamp ends with the label of the device session the message came from, such as
`[Tue 14 Oct, 14:05, Sydney · phone]`, so the model can fit its reply to the screen the user reads
it on. [The API](../channels/api.md#device-sessions) covers where the label comes from. A message
whose label was forgotten with its text, or one that holds no label, shows the time alone.

## The tool

The tool reads nixie's clock and returns the time in UTC, the local time with its UTC offset, the
local weekday, the zone, and whether the zone came from a message or from the default. It takes the
zone from the newest `owner_message` record in any thread that carries one, because the newest
message is the best evidence of where the user is now. When no message carries a zone, it answers in
the default zone from the deployment configuration and says so, so the model can tell the user it
assumed the zone.

The tool reads only nixie's own log and acts on nothing outside nixie, so it runs direct and the
read-only rule allows it. Every result field counts as the user's own data.
