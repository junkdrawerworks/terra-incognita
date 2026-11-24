# Terra Incognita

**Play it: [terra-incognita.junkdrawer.works](https://terra-incognita.junkdrawer.works/)**

**Make a map of a world that doesn't exist.** Roll a random world, or start from blank ocean and sketch one yourself:
coastlines, mountain ranges and rivers, drawn with a finger or a mouse. Rain runs downhill, so rivers and lakes form on
their own, the climate decides where forest and desert go, and realms spread out from their capitals until mountains
and sea stop them. Every town has a page for its story.

<p align="center">
  <img src="docs/phone-world.png" alt="A generated continent in shaded relief, with five realms outlined in color, named rivers, and capitals marked with stars" width="250">
  &nbsp;
  <img src="docs/phone-sketch.png" alt="A hand-drawn island in shaded relief, with two snowy ranges and named rivers and no towns yet, and a second island being sketched as a loop in the sea beside it" width="250">
  &nbsp;
  <img src="docs/phone-place.png" alt="The page for a capital: its coast and river, realm, population and local goods, its realm's name, title, tongue and colour, and a rumor rolled from the map kept in its notes" width="250">
</p>

## How it plays

- **Sketch.** *Land*: draw a loop and land rises inside it, with hills and a coast as smooth or jagged as you like.
  *Sea*: a loop floods, for bays, straits and inland seas. *Mountain range*: draw the ridge line; a valley it blocks
  drains through a gorge at the lowest pass instead of becoming a lake. *River*: draw from the source toward the sea,
  and a valley forms so the water follows your line; the map names every river you draw.
- **Brushes for the details.** Raise, Lower and Smooth reshape the ground; Wetter and Drier move the rain, and the
  forests, grassland and deserts move with it.
- **Water finds its way.** Every patch of ground drains downhill to the sea. Where enough rain gathers there's a river,
  and every river has a name of its own, which it keeps as you reshape the land (*Rename* on a place's River line gives
  it one of yours); where water can't get out it pools into a lake.
- **Climate from latitude and height.** Cold in the north, warm in the south, 6.5 °C cooler for every kilometre up, and
  rainfall in millimetres a year. Fourteen kinds of land, from ice sheet to jungle.
- **Realms.** A capital claims the land around it until hills, deserts and sea make going further too costly, and its
  towns push the border out. Each realm has its own tongue, so towns founded inside it sound like they belong there.
- **Places.** Tap any town or patch of ground to see its position, elevation, climate, nearest neighbour and local
  goods, with distances in leagues of 4.8 km, and its river: which way it flows, how far on it reaches the sea and how
  much land it drains. Keep notes for your lore, or roll a rumor built from the map around it. From the keyboard, Tab
  to the map, pan it with the arrow keys and press Enter to read the spot in the middle. The Codex lists every place
  and every sea, region and range named on the map, and finds words in your notes.
- **Keyboard.** Every tool has a letter (V, P, R…), [ and ] size the brush, F shows the whole map, and Ctrl S saves
  the world file; the World tab lists them.
- **Two looks.** Terrain is shaded relief; Atlas is parchment with drawn mountains and trees. A world file opens in
  the look it was saved in.

  <img src="docs/desktop.png" alt="The Atlas look on a laptop: the starting continent on parchment, with drawn mountains and forests, five realms outlined in colour and named rivers, beside the page for the capital Ninten" width="640">

- **Your worlds.** Every world you generate, start from blank ocean or open from a file is kept in the list at the top
  of the World tab, with a picture of it and when it last changed, to open, duplicate or delete. A new world never
  replaces the one you had, and Undo goes back to it. The last world you deleted, or a world as it was before *Clear
  places and labels* took places with notes in them, waits under the list to be brought back.
- **Seed links.** *Copy seed link* in the World tab copies a link such as
  `https://terra-incognita.junkdrawer.works/#seed=20417&shape=continent`. Opening it grows that world from its seed and
  shape and adds it to Your worlds. Edits and notes don't go with it; for those, send the world file.
- **No account and no server.** Your worlds save themselves in your browser. *Save world file* and *Open world file*
  keep one or move it to another device, and *Save map image* makes a picture of it. A browser can clear what a site
  keeps, so once a world has work in it newer than its last world file, the World tab says since when. It works offline
  and installs to a phone's home screen, where it asks the browser to keep its storage.

## Running it

It's a static site: plain HTML, CSS and JavaScript, with no build step.

```sh
npm start                     # or any static file server, then open http://localhost:8080
npm test                      # draws a world in Chromium through the real page (needs Playwright)
node tools/screenshots.mjs    # redraws docs/*.png and og.png (needs npm install for upng-js)
node tools/make-icons.mjs     # redraws the PNG icons from icon.svg
node scripts/build.mjs        # writes dist/terra-incognita.html and dist/artifact.html, single-file copies for Claude's Artifact viewer
```

In Claude, `dist/artifact.html` is published as an Artifact with the capabilities `{sample: {}, downloads: true}`:
`sample` powers *Write its history*, and `downloads` powers the two Save buttons. Without `downloads` those buttons
are hidden.

To put it online with GitHub Pages: **Settings → Pages → Build and deployment → Deploy from a branch**, then pick `main` and `/ (root)`.

### Files

- `index.html`: the page.
- `js/app.js`: the whole app: world generation from a seed, drainage and rivers, climate, realms and borders, names,
  drawing the map, the tools and the panels. `window.terra` is a small hook the test and the screenshots drive it with.
- `js/edge-guard.js`: keeps a line sketched near the side of a phone's screen from throwing you out of the world when
  Android takes it for its back gesture: a Back while a finger is on the map, or just after a touch on it was taken,
  leaves the map as it was.
- `css/app.css`: the page, with light and dark palettes.
- `fonts/`: IM Fell English and IM Fell English SC, Instrument Sans, and IBM Plex Mono (all SIL Open Font License),
  served from here so nothing loads from elsewhere.
- `manifest.webmanifest`, `icon.svg`, `icon-180.png`, `icon-192.png`, `icon-512.png`, `icon-512-maskable.png`: the
  name and icons for installing it to a home screen.
- `sw.js`: keeps a copy for using offline. On a connection that isn't answering, a page opens from that copy after four seconds. `FILES` in it is a fingerprint of the files it keeps: change one and `npm test` says what to set it to, so a release never leaves the copy half old.
- `scripts/build.mjs`: the single-file copy. Inside Claude, a town's page there can also ask Claude to draft its history
  from the map; on the site that button stays hidden.
- `tools/screenshots.mjs`, `tools/make-icons.mjs`, `tools/icon-full-bleed.svg`: the pictures and icons.
- `test/e2e.mjs`: plays it on a phone-sized screen and a laptop-sized one, and checks it still works offline.
- `test/fixtures/`: a world file from an earlier build, which must keep opening.
- `LICENSE`: MIT.
