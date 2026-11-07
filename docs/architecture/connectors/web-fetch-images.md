# Web fetch images

The web fetch tool returns an image it fetches to the model as image content, so the model can look
at a chart or a photo by its URL. [Web fetch](./web-fetch.md) covers the tool's result, the fetch
sandbox and the fetcher that reads the image's body.

## The result

For an image, the model gets the tool's usual result and, beside it, the image as an image block.
The result's `text` is null, and its `image` field holds the media type, width and height in pixels
of the image the model sees, after any downscale.

The model gets no image block in these cases, and the result or an error says why:

| Case                                                                              | What the model gets                                        |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| the body is longer than the `image_bytes` value of the `web_fetch` config section | the result, with `isTruncated` true                        |
| the site's bot protection sends a challenge in place of the image                 | the result, with `blocked` set to the reason               |
| the image would pass the session's image caps                                     | an error that says the session holds all the images it can |
| the call has no conversation session                                              | an error, since only a session can show the model an image |

The session's caps limit how many images, and how many bytes of images, one conversation session
holds, as [inbox records as messages](../core/conversation-turns.md#inbox-records-as-messages)
describes. A call has no conversation session when it comes under its endpoint's own token in place
of a turn's step token, as [one endpoint per run](./tool-calls.md#one-endpoint-per-run) describes.

The tool marks every field of its result as outside content, because text inside an image can carry
instructions, as page text can. The tool stores no copy of an image, so the model fetches an image
again by its URL to see it again.

## Downscaling

The tool reads each image on the host, outside the fetch sandbox, with Bun's built-in image codecs.
It takes the format from the image's bytes, never from the content type the site sent. The tool
checks each image against 2 limits:

- the long edge, in pixels: the `image_long_edge` value of the `web_fetch` section;
- the API limit, in bytes: the most the Messages API takes for one image. `imageLimits.bytes` in
  `libs/contract` sets it, and the images the user attaches to a message keep to it too.

| Image                                                           | What the model gets                               |
| --------------------------------------------------------------- | ------------------------------------------------- |
| a JPEG, PNG, WebP or GIF within the long edge and the API limit | the bytes the site sent                           |
| a JPEG past the long edge or the API limit                      | a new JPEG, its longer side at most the long edge |
| a PNG, WebP or GIF past the long edge or the API limit          | a new PNG, its longer side at most the long edge  |
| a format the model does not take, such as BMP                   | a new PNG, its longer side at most the long edge  |

The tool shrinks an image only to fit the long edge, and never enlarges one. An image within the
long edge keeps its width and height in the new encoding. When the new PNG is still past the API
limit, the tool encodes the image again as a JPEG. When a new JPEG is still past the API limit, the
tool returns an error and no image. An animated GIF that the tool encodes again keeps only its first
frame.

The tool returns an error with the codec's reason for a body that the codecs cannot read as an
image. The tool reads each image's header first, and returns an error for an image that claims more
pixels than the `maxPixels` value in `modules/connectors/src/fit-fetched-image.ts`, before it
decodes any pixel. A small file then cannot claim a canvas that would fill the host's memory.
