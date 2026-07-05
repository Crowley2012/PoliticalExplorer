# US Politics Explorer

An interactive, zoomable bubble map of the United States political system.
Start at the whole federal government and click your way down — branches →
chambers → every member of Congress, the Cabinet, the Supreme Court, all 50
governors, and pointers to state legislatures and local government.

![Party colors](https://img.shields.io/badge/Democrat-blue-3987e5) — every
person is colored by party (blue = Democrat, red = Republican, gold =
Independent, gray = nonpartisan offices like the judiciary), so the partisan
makeup of any body is visible at a glance.

## Run it

No build step, no dependencies — everything is local static files:

```
# from this directory, either just open index.html in a browser, or:
npx serve .          # or: python -m http.server 8000
```

(Member portraits load from the web; everything else works offline.)

## Using it

- **Click a bubble** to zoom into it (e.g. Congress → House of Representatives → a member).
- **Click a person** to open the detail panel: photo, party, state/district,
  term dates, age, phone, and links to their official site, Congress.gov
  profile, and GovTrack voting record.
- **Click the background** or press `Esc` to zoom back out; use the
  **breadcrumbs** (top-left) to jump to any ancestor level.
- **Search** (`/` to focus) finds any person, state, or office by name.
- The **info card** (bottom-left) describes whatever you're focused on and
  shows its party-split bar.
- **States & Local Government** → any state → its governor, state legislature,
  congressional delegation, and a Local Government node with links for finding
  county/municipal officials (there are too many thousands to enumerate).

## Data

| What | Source | Freshness |
|---|---|---|
| Members of Congress (539) | [unitedstates/congress-legislators](https://github.com/unitedstates/congress-legislators) (`data/legislators-current.json`) | re-downloadable anytime |
| President, VP, Cabinet | curated in `build-data.mjs` | verified 2026-07-05 |
| Supreme Court | curated in `build-data.mjs` | verified 2026-07-05 |
| 50 governors | curated in `build-data.mjs` | verified 2026-07-05 |

### Updating the data

```
curl -L -o data/legislators-current.json https://unitedstates.github.io/congress-legislators/legislators-current.json
node build-data.mjs        # regenerates data.js (the file the app loads)
```

For executive/judicial/governor changes, edit the constant tables at the top
of `build-data.mjs` and re-run it.

## Files

- `index.html` / `styles.css` / `app.js` — the app (D3 v7 zoomable circle packing)
- `build-data.mjs` — transforms the raw dataset + curated tables into `data.js`
- `data.js` — generated hierarchy the app loads (don't edit by hand)
- `lib/d3.min.js` — vendored D3, so the app works without a network
