# Contextual scenes and reference anatomy

The projection is controlled through speech, typed commands and existing drag/pinch gestures. Floating playback/model buttons are removed from 3D scenes. The send control is a quiet 44px touch target.

## Command semantics

- `Mostra o sistema solar` creates the orbital scene.
- `Isola Marte` / `Focus on Mars` brings the existing Mars forward; the other objects recede and dim. Geometry UUIDs, orbital phase and animation time are retained.
- `Zoom in` operates on that view. `Mostra tudo` restores the same scene.
- `Mostra-me só Marte` / `Show me only planet Mars` explicitly requests a separate detailed model.
- The shared focus controller applies to labelled actors in compositions, planets, journeys, motor assemblies and anatomy. A part not present as a separate object produces an honest unavailable response; it does not trigger an unrelated image search.

## Anatomy

`Mostra o esqueleto`, `Mostra o corpo humano`, `Isola o crânio`, `Isola o coração`, `Mostra só os pulmões`.

21 anatomical groups use the actual BodyParts3D 4.0 reference meshes, with common coordinates, natural colours, fine holographic material and continuous particle transitions. The whole-body view shows internal anatomy (skeleton and selected major organs), not every tissue or a clinical scan. Anatomical names/FMA concepts and source element IDs remain in `travis-anatomy-catalog.mjs`.

The 163,950 triangles and ~2 MB of quantised geometry are downloaded on demand in three concurrent requests, cached in memory, and decoded once. Every file is below the phone synchroniser's 450 kB limit. New requests cancel stale visual loads. No generated code or remote scripts run to build these meshes.

Source and attribution: [BodyParts3D](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/desc.html), © The Database Center for Life Science, [CC Attribution 4.0 International](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html). Adaptations: regrouping, simplification, coordinate conversion, quantisation and rendering. Attribution is available through the existing discreet **Fontes** dialog and `assets/travis/anatomy/ATTRIBUTION.txt`. The official licence changed in February 2025; original OBJ header comments still carry the older licence notice.

Reproduce assets with `python scripts/prepare_travis_anatomy.py /path/to/bodyparts-source` (numpy + fast-simplification). The source directory must contain the official PART-OF OBJ ZIP and PART-OF metadata files from the official LATEST archive.

## Boundaries

An arbitrary photograph is not a complete 3D model. The existing sourced-model research path remains available for unfamiliar objects; this release does not claim universal 3D generation. Map routes and buildings require actual geographic/routing data and are not implemented here. The bilingual voice backend and its speech recognition remain unchanged.

## Verification

`travis-context-selftest.mjs`: same-object continuity, focus switching, restoration, PT/EN focus/only distinction, complete-body reference bounds, anatomy part membership/budgets and cancellation.

`travis-worlds-browser-selftest.mjs`: mobile UI, controls absent, 44px submit, solar focus/zoom/only, anatomy and motor focus, mesh identities, unchanged animation time, return to face, desktop and reduced-motion mode.
