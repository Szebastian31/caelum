#!/bin/bash
# Makes the README screenshots from the real app, on a fixed night (15 January 2027, 21:00 over Gliwice),
# each scene in its own skin (see demo.js), plus a banner with five of them in phone frames.
# Nothing is saved: your own browser data and your phone aren't touched.
#
#   tools/screenshots.sh            every scene in its own skin
#   tools/screenshots.sh dusk       every scene in one skin (indigo, dusk, atlas, glacier or red)

cd "$(dirname "$0")/.."
SKIN="${1:+&skin=$1}"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -x "$CHROME" ] || { echo "Google Chrome isn't in /Applications. Install it, or change CHROME in this file."; exit 1; }
ROOT="$(pwd)"
mkdir -p screenshots
# the old screenshots, so names that are no longer used don't hang around
rm -f screenshots/red.png screenshots/*.svg

shoot() { # url, file, width, height, pixel scale
  rm -f "$ROOT/screenshots/$2"
  "$CHROME" --headless --disable-gpu --hide-scrollbars --no-first-run --no-default-browser-check --allow-file-access-from-files \
    --user-data-dir="$(mktemp -d)" --force-device-scale-factor="$5" --window-size="$3,$4" \
    --virtual-time-budget=8000 --screenshot="$ROOT/screenshots/$2" "$1" >/dev/null 2>&1 || true
  if [ -s "$ROOT/screenshots/$2" ]; then echo "  screenshots/$2"; else echo "  screenshots/$2 FAILED"; fi
}

# each phone screen is 390 × 844 points at 3× (1170 × 2532 px, an iPhone-sized screenshot), via tools/phone.html
echo "Phone screens:"
for scene in sky planet north star time below tonight find camera styles; do
  shoot "file://$ROOT/tools/phone.html?demo=$scene$SKIN" "$scene.png" 780 1688 1.5
done

# the banner's middle phone: the same view as sky.png, in the Red night skin
shoot "file://$ROOT/tools/phone.html?demo=sky&skin=red" "sky-red.png" 780 1688 1.5

echo "Banner:"
shoot "file://$ROOT/tools/banner.html" "banner.png" 1280 720 2
echo "Done. Open the folder with: open screenshots"
