// What the terminal's account does with the image's media tools: both print their version, a
// generated 1 second clip transcodes, and a generated image shrinks to half its size.
export const mediaProbe = [
  'set -eu',
  'ffmpeg -version',
  'magick -version',
  'cd "$(mktemp -d)"',
  'ffmpeg -loglevel error -f lavfi -i testsrc=duration=1:size=64x64:rate=5 -c:v libx264 -pix_fmt yuv420p clip.mp4',
  'test "$(ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of csv=p=0 clip.mp4)" = h264',
  'magick -size 64x64 gradient:red-blue input.png',
  'magick input.png -resize 32x32 output.png',
  'test "$(magick identify -format %wx%h output.png)" = 32x32',
].join('\n');
