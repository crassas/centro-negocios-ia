# Continuous Travis holograms

The face, its assembly grains and the projected particle forms now share the
same copper/amber lighting function. The original animated head remains the
conversational default. Its geometry supplies the departure and return positions
for the particle field; projected objects react to the existing speech envelope.

## Problems reproduced before the change

- The main scene imported the projection controller with `?v=matter-2`, while
  the cockpit imported it with `?v=conversation-2`. Browsers instantiated two
  independent controllers. The first `show me a house` was immediately followed
  by a second controller's workspace-menu event, which erased the house.
- Object fitting scaled and translated the entire particle object, including
  positions sampled from the actual head. Changing forms or returning to the
  face could jump between different coordinate systems.
- Saturated point highlights and decorative geometry made planets small and
  much brighter than the face. The face's assembly particles also used a cyan
  color absent from the intended warm visual language.

## Current behaviour

- One versioned projection-controller import in both entry points.
- Samples and destinations expressed in one coordinate system. Only object
  destinations receive viewport fitting. Return samples retain the head's actual
  world transform. Interrupted transformations preserve displayed positions.
- Normals, depth-dependent point sizes and the shared lighting function give the
  objects the face's warm appearance. The same existing audio envelope drives
  slight motion and light variation; no extra speech engine is loaded.
- The face dissolves only after its particle field is visible, then reconstructs
  as the return finishes. Duplicate dismiss events cannot restart that return.
- The house has a sampled roof, windows and door; Saturn's rings share a plane.
  Explicit requests for a random planet choose one of the eight named planets.
- Projections return automatically after the existing speech/interaction hold.
  Manual pinning and view controls retain their existing behaviour.

Examples: `Mostra-me uma casa`, `Mostra-me um planeta aleatório`, `Show me Saturn`,
`Rotate right`, `Zoom in`, `Volta ao Travis`.

These are illustrative local geometries. They are not physical holographic
projections, scans, live astronomical imagery or reconstructions of arbitrary
real objects.

## Verification

`scripts/travis-morph-continuity-selftest.mjs` accepts a Three.js 0.180.0 module
path. It checks real transforms, destination-only fitting, interrupted morphs,
view changes, the voice uniform, exact return bounds and continuous visibility.
The Pages workflow runs this test against the pinned Three.js release.

`scripts/travis-morph-browser-selftest.mjs` accepts the Playwright module path,
Chromium executable, Three.js package directory and an evidence directory. It
loads the full UI at a phone-sized viewport with isolated backend responses.
It checks the first house request, a Portuguese random-planet request, successive
forms, a synthetic voice envelope, automatic return and shader errors. Screenshots
and observed states are test evidence, not a physical phone-GPU benchmark.

The updater stages the shared head material and cockpit controller alongside
the other modules and validates their import versions before replacing files.
