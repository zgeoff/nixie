Read the user's messages on the conversation's thread with `log.read`. Pass the first time of the
`since` block as `from` and the second as `to`. Call `log.read` again with `next` as `after` until
`next` is null.

Then save each fact worth remembering. Make one `memory.remember` call for each memory:

- Pass the user's exact words as `quote`, and the `eventID` of that message from `log.read` as
  `eventID`.
- Quote only entries whose `role` is `owner`. A quote from any other role does not count as
  evidence.
- When a memory item already holds the fact and needs a change, call `memory.edit` on it in place of
  saving a new item.

Leave a message alone when it holds nothing worth remembering.
