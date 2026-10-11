# Travis resource rest

This change releases disposable inference and media resources without deleting user memory or rebuilding Travis.

## Behaviour

- Voice workers release after 180 seconds without a completed request, checked every 30 seconds. `TRAVIS_VOICE_IDLE_SECONDS` permits 60–3600 seconds. The same request lock protects model startup, inference and eviction. A subsequent request starts the selected worker normally.
- `/health` and the voice runtime report current worker residency, summed worker RSS, idle durations and eviction errors. RSS is a process measurement, not a promise of equivalent system-wide free RAM. Connection status distinguishes installed, sleeping models from unavailable models.
- Public cameras cancel pending image/metadata requests on backgrounding, destroy HLS buffers, release stream leases and revoke image object URLs. The selected source stays in memory and is requested again on return. The player respects the gateway's ten-second per-source refresh interval and performs at most one retry after a rate-limit response. No continuous-video claim is made for still images.
- Road Live pauses requests and refresh timers without removing observations or changing whether its card was open. An interrupted request resumes; recent data does not cause a redundant fetch. Failed refreshes retain clearly labelled last-known data.
- The official globe unloads its iframe after 30 seconds hidden, or immediately on pagehide. Return restores its last commanded coordinates, layers, annotations, imagery and visual style. Manual movement inside the upstream globe is not exposed by its existing message contract and is not newly captured here.
- Explicitly closed features remain closed after wake. Persistent SQLite memory is outside this resource policy.
- The entry page must load `travis-cinematic-shell.mjs` once. A duplicate import with a second query string creates another module instance and can replace the working control API with an unmounted instance.

## Verification

Local checks passed: production VoiceWorker request/pipe/restart contract, idle-worker locking, error isolation, timeout configuration, browser lifecycle policy, Road Live panel/marker retention, interrupted-fetch cancellation/resume and labelled stale-data fallback.

Deployed to the live Travis instance on 2026-10-11 after source backups and a router reload. Four backend tests and two browser-controller tests passed locally and on the device. Browser verification passed with 60 current TfL records, 18 preserved map annotations, and two genuine HTTP 200 JPEG responses from the same Trafalgar Square camera (352 px wide). All four initially resident voice workers subsequently stopped through the idle policy; worker RSS reached zero for this managed pool (not for Travis as a whole). The next English synthesis started only its required worker and returned a valid WAV in 4.28 seconds. Memory and coordination SQLite quick checks passed. Served module hashes matched the tested deployment. See travis-resource-rest-proof.json.

The browser check uses real controller modules, DOM, TfL road data and genuine camera images. It simulates visibility events and the GEV renderer's message protocol; it does not verify Cesium GPU rendering, Android microphone/speaker use, or mobile OS background scheduling. The cold-start HTTP synthesis test confirmed model wake and valid WAV output; no physical speaker playback was performed.

## Deployment

Use the existing recovery branch and compare live source hashes before edits, since other chats can change this installation. Save timestamped source backups. Keep the supervisor-required `eye-8-private` / `gev-17b` module URLs and the single canonical `voice-first-cinema-2` cinema link; otherwise its recovery guard re-adds a second import. Update the service-worker cache and include the new lifecycle module. Recheck `/health.busy` before reloading the router; leave active user work uninterrupted. Test health, model sleep/wake and browser transitions, then commit/push the verified change.

Runtime: `/root/jarvis_local.py`, `/root/.centro-ui/`.
Staging: `/root/.centro-jarvis/rest-stage/`.
Recovery branch: `rescue/travis-preserve-20261011`.

## API references

- https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API
- https://docs.python.org/3/library/threading.html#rlock-objects

## On-demand startup — 2026-10-11

Automatic voice preloading is now opt-in via TRAVIS_WARM_VOICE_STARTUP=1. By default, a router restart does not load the four voice workers before any actual request. Each selected worker still starts on demand and follows the existing 180-second idle policy. The first voice request after rest may include model startup time. This reduces unnecessary voice residency; it does not establish the cause of Android Obsidian closures. The vault inspected during this change was about 14 KB with no community-plugin list. Android exit logs were inaccessible from the available Ubuntu session. See travis-startup-resource-proof.json for observed startup and wake behaviour.
