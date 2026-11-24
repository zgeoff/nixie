# Images

The assistant draws a picture, looks at it, and asks for a change, pass after pass. `image.draw`
makes a new image from a prompt, or edits a stored image when the call names it in `from`. nixie
stores every image it gets back and sends the stored bytes with each edit, so no pass depends on
state that a provider keeps. The tools run in the nixie server process, outside every sandbox, and
each provider's API key stays there. [Tool calls](./tool-calls.md) covers the endpoint that runs
them.

## The tools

| Tool           | Effects | What it does                                                                              |
| -------------- | ------- | ----------------------------------------------------------------------------------------- |
| `image.draw`   | `fetch` | Draws a new image, or with `from` edits one. The call is paid.                            |
| `image.import` | `note`  | Keeps a code-run file or a photo of the user as an image, as a PNG scaled to 2048 pixels. |
| `image.list`   | `note`  | Lists images, newest first, 20 a page, filtered by `isPinned` or by `from`.               |
| `image.read`   | `note`  | Shows a stored image again with the prompt it was drawn from.                             |
| `image.name`   | `note`  | Names an image, or clears the name with `null`.                                           |
| `image.pin`    | `note`  | Marks an image so `image.list` can filter on it. `image.unpin` clears the mark.           |

All 7 run [direct](./tool-calls.md#a-tool-definition). An image tool is present only when the
deployment config has an `images` block.

`image.draw` takes a prompt of 1 to 4,000 characters, and optionally:

- `size`, one of `1024x1024`, `1536x1024` and `1024x1536`, for a new image. An edit comes back at
  the size of its source, so `from` and `size` never appear together.
- `from`, the image to edit.
- `references`, up to 4 image IDs that the provider sees beside the prompt, so a subject stays the
  same.
- `profile`, a key of `images.profiles`. The `images.default` profile answers when it is absent.

A stored image whose size is not one of the 3 sizes, such as an import, is padded with transparent
pixels to the size nearest its shape before it goes to the provider, and the edit comes back at that
size. The price follows that size.

The tool's description lists every configured profile with its model, one line each, and names the
default. A result names the image by its short ID, its `from`, the `profile` and `model` that drew
it, its size, whether the picture is shown, and `roomLeft`, how many more images at the largest size
the session's caps still take. The picture itself comes beside the result as
[web fetch images](./web-fetch-images.md) do, and counts against the same session caps. `isShown` is
false on `image.read` and `image.import` when the caps leave no room.

## Refusals

A refusal is a result with a `refusalCode`, never a thrown error. The model reads it and chooses.

| Code                               | Cause                                                                               |
| ---------------------------------- | ----------------------------------------------------------------------------------- |
| `UNKNOWN_IMAGE`, `IMAGE_FORGOTTEN` | A `from` or a reference names no image, or one the user forgot                      |
| `UNKNOWN_PROFILE`                  | `profile` names no key of `images.profiles`                                         |
| `NO_EDIT`                          | The profile's provider takes no source or no references                             |
| `IMAGE_CAPS_FULL`                  | The session has no room for another image; the result sets `roomLeft` to 0          |
| `IMAGE_REFUSED`                    | The provider refused the prompt; `profiles` lists the other profiles                |
| `IMAGE_FAILED`                     | The provider failed, its reply is over `maxStoredBytes`, or the bytes do not decode |
| `IMAGE_TIMEOUT`                    | The provider gave no reply within `drawTimeoutMs`                                   |

`UNKNOWN_PROFILE`, `IMAGE_FAILED` and `IMAGE_TIMEOUT` set `profiles` to every configured profile,
and `IMAGE_REFUSED` to the others. Each entry holds the profile's key and its `model`.

`image.import` also returns `UNKNOWN_FILE`, `FILE_FORGOTTEN`, `UNKNOWN_PHOTO` and `NOT_IMAGE`.
`image.name`, `image.pin`, `image.unpin` and `image.read` return `UNKNOWN_IMAGE` or
`IMAGE_FORGOTTEN`. nixie never tries another profile on its own. The model retries a refused prompt
on another profile by calling `image.draw` again with `profile`.

## The charge

`image.draw` is a [paid tool](../policy/budgets.md#paid-tools) whose price depends on its input. The
profile's `prices` give the micros per image for each size, and the paid call reads the price after
it checks the input. The call runs in this order:

1. `check` refuses an unknown image, an unknown profile, a profile that takes no edit, and a full
   session, before anything is charged. A check that passes holds room for one image at the largest
   size under the call's ID, so draws that run side by side cannot take the same last room. The call
   frees the hold when it reserves its picture, and when it ends without running.
2. The call charges `image.draw-day` ($2) and `image.draw-month` ($20), then runs.
3. A refusal or a failure credits the charge unless the provider billed the call. An unbilled
   refusal is credited; a billed one stands.
4. A timeout keeps the charge, because the image may exist at the provider.

Image calls bypass the model gateway, so the [spending stop](../policy/model-gateway.md) never
counts them. The cost sits under the result's `hidden.costUSD`, which the model never reads.

## Photos of the user

A draw whose `from` or `references` names an image imported from a photo sends that photo to the
provider. The tool's `prepare` hook reports the provider as the call's destination, with the effects
`fetch` and `send`, so the [decision point](../policy/decision-point.md) treats the draw as a send:
a rule that allows sends to that provider runs it direct, and otherwise it queues as a proposal for
the user. The proposal's input holds the image IDs and its destination is the provider. The
proposal's card shows each photo among them, read from the stored image when the card is read. When
the user approves, the call runs `prepare` again, and a destination that changed since the proposal
makes the call return `changed` and run nothing.

## The provider interface

```ts
// connectors module. Adapters: image-openai, image-gemini.
interface ImageProvider {
  takes: { source: boolean; references: boolean };
  draw(request: DrawRequest): Promise<DrawReply>;
}

type DrawReply =
  | { kind: 'image'; mediaType: string; bytes: Uint8Array }
  | { kind: 'refused'; reason: 'safety' | 'other'; message: string; isBilled: boolean }
  | { kind: 'failed'; reason: string; isBilled: boolean };
```

A request carries the model, the prompt, the size, the source bytes of an edit, the reference bytes
and an abort signal that fires after `drawTimeoutMs`, from `image-limits.ts`. An adapter throws when
the signal aborts, and the tool then returns `IMAGE_TIMEOUT`. An adapter sends its key in a request
header, never in a URL, and replaces the key with `<the API key>` in any reason or message it
returns. The tool never keeps the text of a thrown error.

| Adapter        | Request                                                                                                                      | Refusal                                                                          |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `image-openai` | `images/generations` as JSON, or `images/edits` as multipart with each `image[]`                                             | Error code `moderation_blocked`; billed only when the moderation stage is output |
| `image-gemini` | `interactions` with an image `response_format` for JPEG, the one image type the API gives; the aspect ratio follows the size | A reply with no image block, billed; a 400 that names a safety block, not billed |

Any other HTTP error, and an unreachable host, return `failed` unbilled. A 200 reply with no
readable image returns `failed` billed, because the provider answered.

## The config

```yaml
images:
  default: main
  profiles:
    main:
      provider: openai # openai or gemini
      model: <model id>
      credential: deployment:openai-images # a connector_credentials entry
      prices: { '1024x1024': 40000, '1536x1024': 60000, '1024x1536': 60000 } # micros per image
    google:
      provider: gemini
      model: <model id>
      credential: deployment:gemini-images
      prices: { '1024x1024': 40000, '1536x1024': 60000, '1024x1536': 60000 }
```

`default` names the profile that answers a draw with no `profile`. Name an OpenAI profile there, and
keep a Gemini profile beside it for the model to retry a refused prompt on. nixie refuses to start
when a profile names a credential that the secrets file lacks, when `prices` lacks a size, or when
`default` names no profile. The adapters use each provider's public API address, and the model IDs
come from the config alone.

## Storage

Each image keeps its bytes in the attachments of the `tool_result` record of the call that made it,
and a row in the `images` table, which the call writes in the same transaction as the record:

| Column                                           | Holds                                                                 |
| ------------------------------------------------ | --------------------------------------------------------------------- |
| `image_id`, `uuid`                               | The short ID the model sees, and the UUID under the result's `hidden` |
| `sequence`, `position`                           | The record and the attachment that hold the bytes                     |
| `parent_id`                                      | The image an edit started from                                        |
| `source`, `source_seq`                           | `draw`, `file` or `photo`; an import's original record                |
| `is_pinned`                                      | The latest `image.pinned` or `image.unpinned` record                  |
| `profile`, `model`                               | The profile and model of a draw; null for an import                   |
| `media_type`, `size`, `byte_count`, `created_at` | The stored PNG                                                        |

nixie stores every image as PNG, converting a provider's reply first, and refuses a reply over 8
MiB. The prompt and the references sit among the call record's erasable fields, never in the table.
An image ID resolves on every thread, and [`file.send`](./code-tool.md#sending-a-file) takes one to
show the image under a reply.

`image.name` writes an `image.named` record, whose name is erasable, and `image.pin` and
`image.unpin` write `image.pinned` and `image.unpinned` records.

A [forget](../core/erasable-fields.md#forgetting-a-record) of a call's record makes its image
unreadable and leaves the row, so the edit chain keeps its shape. The forget cleanup also removes
the key of each image imported from the forgotten record, so a forgotten photo erases its imports. A
source, a reference and a provider reply never count against the session's image caps; only the
picture shown beside a result does.

The web client's [images page](../channels/client.md#the-images-page) reads the stored images
through [the `images` calls](../channels/api.md#reading-and-forgetting-images). Its forget takes the
call record, the result record, every name record and every tool record that quotes the name or
prompt of one image.
