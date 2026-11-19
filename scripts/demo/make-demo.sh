#!/bin/bash
# Records docs/assets/demo.mp4 + demo.gif + demo-poster.jpg (macOS/Linux, needs ffmpeg).
set -e
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="${WORK:-/tmp/cybersoap-demo}"
rm -rf "$WORK"
mkdir -p "$WORK/ud" "$WORK/collections" "$WORK/frames"
printf '{"collectionsPath":"%s/collections","language":"%s","theme":"dracula","autoUpdate":false}' "$WORK" "${DEMO_LANG:-fr}" > "$WORK/ud/settings.json"

node "$ROOT/scripts/demo/mock-server.js" > "$WORK/mock.log" 2>&1 &
MOCK=$!
cd "$ROOT"
npx vite build > /dev/null
CYBERSOAP_USER_DATA="$WORK/ud" npx electron . --remote-debugging-port=9333 > "$WORK/electron.log" 2>&1 &
APP=$!
trap 'kill $MOCK 2>/dev/null; pkill -f "remote-debugging-port=9333" 2>/dev/null; true' EXIT
for i in $(seq 1 30); do curl -s http://127.0.0.1:9333/json > /dev/null && break; sleep 1; done
sleep 3

node "$ROOT/scripts/demo/record-demo.js" "$WORK/frames" "$ROOT/docs/assets"

OUT="$ROOT/docs/assets"
ffmpeg -y -loglevel error -f concat -safe 0 -i "$WORK/frames/frames.txt" \
  -vf "scale=1280:-2:flags=lanczos,fps=30,format=yuv420p" -c:v libx264 -crf 22 -preset slow -movflags +faststart -an "$OUT/demo.mp4"
ffmpeg -y -loglevel error -f concat -safe 0 -i "$WORK/frames/frames.txt" \
  -vf "fps=10,scale=960:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" "$OUT/demo.gif"
ffmpeg -y -loglevel error -i "$OUT/demo.mp4" -ss 00:00:14.5 -frames:v 1 -q:v 3 "$OUT/demo-poster.jpg"
ls -la "$OUT"/demo*
