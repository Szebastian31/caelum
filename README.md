# Caelum

Hold your phone up and the real sky over you lines up behind the glass.

Caelum is a sky map for the browser. Stars, the Moon, the Sun and the five naked-eye planets are calculated on the phone for the current minute and your location. It follows the phone's motion sensors, and it tells you honestly how accurate the compass is.

A sibling to Consensus Weather, Fidelis and Vestis.

## Features

- Real-time sky for any location (defaults to Gliwice), ~120 bright stars, 20 constellations, Milky Way along the real galactic plane
- Motion mode: point the phone and the sky follows (needs https)
- Compass accuracy badge, with recalibration tips
- Time ruler with momentum to move through the night
- Tap anything for height, direction, rise/set, distance and light-travel time
- Find: an arrow leads you to any object, with a tick when it's centred
- Tonight tab: Moon phase, planets, brightest stars, easy constellations at 22:00
- Five skins: Indigo, Dusk, Atlas, Glacier, Red night
- Installable to the home screen, works offline after the first visit

## Files

| File | What it does |
|---|---|
| `index.html` | Layout and styles |
| `data.js` | Star catalogue, constellation lines, stories |
| `astro.js` | Astronomy maths (sidereal time, alt/az, Sun, Moon, planets) |
| `app.js` | Sky rendering, drag/zoom, motion sensors, time ruler |
| `ui.js` | Tabs, sheets, Tonight, Profile, saved settings |
| `manifest.webmanifest`, `sw.js` | Home-screen install and offline cache |
| `icons/` | App icons |

No build step and no dependencies. It's plain HTML, CSS and JavaScript.

## Accuracy

Positions use J2000 catalogue coordinates with precession applied, and low-precision formulas for the Sun, Moon and planets. They are accurate to roughly 0.3°, which is less than the width of the Moon. The phone compass is the main source of error, typically 5–15°.

## Updating

After changing any file, bump `VERSION` in `sw.js` (e.g. `caelum-v2`) so installed copies pick up the update.
