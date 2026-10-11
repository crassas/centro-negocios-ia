# Persistent Travis coordination

The existing Travis runtime now owns a lightweight coordinator in addition to its existing bounded reflection cycle. No existing memory tables or model weights are replaced.

Every five seconds the coordinator checks pending requests, prioritises foreground activity and marks requests without a receipt after 120 seconds as unverified. It does not replay actions after restart. Its state is stored in `coordination.sqlite`, beside `brain.sqlite`. The existing brain pause control also pauses this cycle. It runs while the service and device are available; it does not imply consciousness or operation after device shutdown.

The browser reports the visible scene while Travis is open and foregrounded, every 15 seconds and before a new command. Current scene observations expire after 45 seconds. Public camera commands have correlated request and result receipts, scoped to the conversation. The final result enters persistent context and is spoken when the current voice turn permits. New turns, closing Travis and pausing voice suppress obsolete announcements. Camera requests use registered public sources only.

Random selection now actually randomises eligible cameras and preserves explicit geographical scope. An image is verified only after browser image decoding. A source record, downloaded still image or browser playback does not prove that the operator's feed is current. Follow-up source identification does not identify objects in the image.

English is the default for the existing personal conversation and a one-time browser preference migration. Explicit subsequent language changes remain available.

## Verification on 2026-10-11

- 61 Python checks passed across coordination, preservation, awareness, continuity, voice streaming and existing brain behaviour.
- JavaScript checks passed for selection policy, registered camera selection, receipt ordering, session isolation and obsolete speech suppression. The legacy file named `travis-cctv-browser-selftest.mjs` uses mocked browser objects, not a real browser.
- The running service reports an advancing five-second heartbeat and no coordinator error. Existing memory and the new coordination database pass SQLite integrity checks.
- Real English TTS-to-STT round trip recognised `Show a random public camera.` exactly; recognition took 4,360 ms. This uses generated audio, not the phone microphone.
- A randomly selected public Norway image was retrieved from the existing gateway and decoded by FFmpeg: 800 × 600, 72,620 bytes. This is not browser playback or evidence of feed freshness.
- A real persistent receipt was deliberately recorded as unverified, because browser playback was not observed. After restart, a live English model response correctly identified the Norway source and said playback and feed freshness were unverified. Public-camera follow-up questions no longer route to the physical phone camera.
- Automatic visual end-to-end verification is BLOCKED: installed Chromium exits with SIGTRAP (-5) before opening a page, including a minimal `about:blank` test. Physical microphone, browser display and phone loudspeaker remain to be confirmed on the phone.

## Phone confirmation

Reload Travis and open its voice interface. Say:

1. `Show a random public camera.` Expect an English acknowledgement, a visible public image or verified video, then a truthful final confirmation. A failed source must be reported as unavailable.
2. `What am I looking at?` Expect the source name and whether it is a still image or video; this does not establish scene understanding.
3. `Show another camera.` Expect a different available registered source.
4. `Close camera.` Expect the camera viewer to close.

The test passes only if the phone recognises the words, displays the source, plays the English reply and correctly identifies the selected source in the follow-up. Record which step fails if any of these does not happen.

## Preservation

Pre-change source files and consistent memory/brain SQLite backups are retained under `/root/.centro-jarvis/backups/coordination-20261011`. Detailed runtime evidence is under `/root/.centro-jarvis/coordination-stage`. The previous full preservation backup remains in place. This branch also includes the existing phone-specific public-camera UI dependencies so these imports are preserved with the change.
