# Web fetch images

The web fetch tool returns an image it fetches to the model as image content, so the model can look
at a chart or a photo by its URL. [Web fetch](./web-fetch.md) covers the tool's result, the fetch
sandbox and the fetcher that reads the image's body.

## The result

For an image, the model gets the tool's usual result and, beside it, the image as an image block.
The result's `text` is null, and its `image` field holds the media type, width and height in pixels
of the image the model sees, after any downscale.

The model gets no image block in these cases, and the result or an error holds the reason:

| Case                                                                              | What the model gets                               |
| --------------------------------------------------------------------------------- | ------------------------------------------------- |
| the body is longer than the `image_bytes` value of the `web_fetch` config section | the result, with `isTruncated` true               |
| the site's bot protection sends a challenge in place of the image                 | the result, with `blocked` set to the reason      |
| the image would pass the session's image caps                                     | an error: the session holds all the images it can |
| the call cannot show the model an image                                           | an error: the call cannot show the model an image |

The session's caps limit how many images, and how many bytes of images, one conversation session
holds, as [inbox records as messages](../core/conversation-turns.md#inbox-records-as-messages)
describes. A call cannot show the model an image when it holds no conversation session. It holds
none when it comes under its endpoint's own token in place of a turn's step token, as
[one endpoint per run](./tool-calls.md#one-endpoint-per-run) describes.

The tool marks every field of its result as outside content, because text inside an image can carry
instructions, as page text can. The tool stores no copy of an image, so the model fetches an image
again by its URL to see it again.

## Downscaling

The tool decodes each image on the host, outside the fetch sandbox, with Bun's built-in image
codecs, and encodes it again. The model never gets the bytes the site sent: a header that reads
cleanly can come before pixel data that does not decode, and the SDK sends each image of a session
again in every later request, so one broken image could fail each of them.

The tool takes the format from the image's bytes, never from the content type the site sent. A JPEG
becomes a new JPEG, and any other format becomes a new PNG. The tool shrinks an image whose longer
side is past the long edge, the `image_long_edge` value of the `web_fetch` section, so that side
fits it. The tool never enlarges an image. An animated GIF keeps only its first frame.

A new image must also fit the API limit: the most bytes the Messages API takes for one image, which
`imageLimits.bytes` in `libs/contract` sets for the images the user attaches to a message too. When
a new PNG is past the API limit, the tool encodes the image as a JPEG, which drops any transparency.
When a new JPEG is past the API limit, the tool returns an error and no image.

The tool returns an error with the codec's reason for a body that the codecs cannot read as an
image. The tool reads each image's header first, and returns an error for an image that claims more
pixels than the `maxPixels` value in `modules/connectors/src/fit-fetched-image.ts`, before it
decodes any pixel. A small file then cannot claim a canvas that would fill the host's memory.
