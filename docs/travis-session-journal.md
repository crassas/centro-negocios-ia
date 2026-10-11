# Travis session journal

## Index

- [2026-10-11: Road panel, world recovery and resource rest](#2026-10-11-road-panel-world-recovery-and-resource-rest)

## 2026-10-11: Road panel, world recovery and resource rest

Scope: changes completed and verified in this work thread. Other chats may have added separate capabilities.

- Camera/world repair: `8bb3913`. The public viewer could not find its root element. The corrected player decoded a genuine TfL image. Natural camera and world routing fixes are recorded in [world repair](travis-world-repair.md).
- Road card behaviour: `ec55f06`. Selecting an occurrence or closing its list keeps the map markers. Explicit Road Live off clears them. See [panel evidence](travis-road-panel-proof.json).
- Resource rest: `e86936d`. Inactive voice workers stop after three minutes and restart on demand. Background camera resources and the globe iframe can be released while their controller context is retained. Road requests pause and resume. The camera player respects the source's refresh cooldown.
- Measured result: all four initially resident voice workers stopped; the managed pool reached zero resident workers. The next English HTTP synthesis completed in 4.28 seconds. This is not a claim that total Travis memory reached zero or that physical audio playback was tested.
- Browser result: 60 TfL records, 18 retained annotations and genuine images from the same source before and after rest. The test uses a GEV protocol fixture and simulated visibility events. See the [complete evidence](travis-resource-rest-proof.json).
- Maintenance finding: the cinema recovery guard expects the `voice-first-cinema-2` query. Keeping one canonical import fixes duplicate module instances while preserving recovery.
- User supplied a Claude Code / Obsidian transcript. Its useful organisational pattern is reflected in [the context index](../TRAVIS_CONTEXT.md): targeted lookup, topic ownership and a concise journal. The transcript's revenue claim is unverified and unrelated to the technical test results.

Persistent conversation databases were preserved and passed their SQLite checks. Source backups remain on the device. No private memory was copied into these notes.
