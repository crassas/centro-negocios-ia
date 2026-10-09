# Travis cinematic content

The previous release reliably transferred particles between shapes but still
sampled the same sphere for most planets. Geometry colors were discarded by the
shared particle shader. Space and letters used a generic object fallback. This
release separates subject interpretation, detailed content, material transfer,
public references and narration timing.

## What is rendered

- 12,000 fine transfer particles plus depth-aware holographic surface cells,
  with the animated head's copper/gold lighting and scanlines. Surfaces build
  after the transfer begins and dissolve before the return. The original facial
  animation, voice envelope, camera and memory remain connected.
- Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, Neptune, Pluto, Moon and
  Sun have separate surface treatments. Saturn has rings; Sun has irregular
  prominence curves. A solar-system view is illustrative and not to scale.
- Earth uses bundled Natural Earth 1:110m land contours. Other planetary surface
  maps are procedural illustrations, not NASA imagery or accurate relief maps.
- Space produces a spiral star field. DNA and an atom have distinct educational
  geometry. Letters preserve accents and literal quoted text (up to 90 characters).
- Simple local architecture, people, vehicles, landscapes and geometric objects
  remain available. Unfamiliar subjects use public reference retrieval rather
  than pretending that one decorative solid represents everything.

## Search and narration

`POST /visual-research` uses Wikipedia's search/PageImages APIs and free-image
filter. It returns a public article, a short extract and, where available, a
bounded JPEG/PNG/WebP thumbnail from a fixed Wikimedia host allowlist. No model
subscription, new Python package or remote code execution is required. Responses
are cached in memory (24 entries, one hour). Redirects stay on the same allowlist.

A retrieved image becomes a textured depth relief in the existing hologram.
The article and image-credit page are linked in the caption. This is explicitly
an **image relief**, not a reconstructed, rotatable, true 3D model. Missing images
or a failed search produce an honest text response. Later responses cannot replace
an intervening user request. Images and article text never become executable code.

An explanation reaches the normal conversational backend. Once its actual audio
has decoded, subject cues use the same AudioContext start time and duration as
speech playback. Recognized subjects become 3D forms; unfamiliar sections can
become short excerpts from the actual spoken text. This is approximate section
synchronization, not forced word alignment. Pin, cancellation, a new request and
close stop the previous sequence. Speech completion returns to the face after a
short hold. No source audio is replaced by synthetic speech in production.

Examples:

- `Mostra Júpiter`, `Mostra Marte`, `Mostra a Terra`, `Mostra o Sol`
- `Mostra o espaço`, `Mostra o sistema solar`, `Mostra-me ADN`
- `Escreve OLÁ`, `Mostra as letras "TRAVIS"`
- `Mostra-me uma borboleta`, `Show me the Eiffel Tower`
- `Explica-me o sistema solar`, `Volta ao Travis`

## References and data

Design references were the creators' case studies, not copied film assets:

- Perception, [Black Panther technology](https://www.experienceperception.com/work/black-panther-tech/)
  and [Cinefex production excerpts](https://www.experienceperception.com/excerpts-from-cinefex-afro-future-feature-article-on-black-panther/): particulate matter forms objects and supports a changing narrative.
- Territory Studio, [Avengers: Age of Ultron](https://territorystudio.com/project/marvels-avengers-age-of-ultron/): content and detail chosen for each lab and character.
- [Natural Earth land data](https://www.naturalearthdata.com/downloads/110m-physical-vectors/),
  [public-domain terms](https://www.naturalearthdata.com/about/terms-of-use/).
  `travis-earth-land.mjs` derives from `nvkelso/natural-earth-vector/geojson/ne_110m_land.geojson`,
  rounded to 0.01 degree; no geopolitical boundaries are included.
- [MediaWiki PageImages](https://www.mediawiki.org/wiki/Extension:PageImages#API).
  Retrieved image rights and attribution remain with their respective sources.

## Verification

The Pages gate runs parser/content tests, a no-network reference-service test and
the full client updater against a temporary installation. Real Three.js tests
retain exact source/target fitting, interrupted transfer, voice and face-return
checks.

`travis-visual-content-browser-selftest.mjs` takes paths to Playwright, Chromium,
Three.js, an evidence directory and optionally a real reference JSON fixture.
It renders the actual UI at phone dimensions, checks named planets, space, text,
DNA, house, references and stale-result rejection, then exercises the actual
voice request/player path with isolated reply/WAV fixtures. Audio-clock changes
must produce Earth and Jupiter and then restore the face. It rejects JavaScript
and shader errors. It does not claim a physical OPPO GPU benchmark.

Runtime updates stage the new modules together and swap index.html last. The
research endpoint loads its module lazily, so a phased update cannot prevent the
voice service from starting. Existing unrelated operator files are preserved.
