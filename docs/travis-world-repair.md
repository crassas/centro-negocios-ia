# Travis world controls repair — 2026-10-11

## Changes

- Fixed the camera viewer root reference: `section.querySelector` cannot find the section itself. This previously stopped opening before any frame request. The real DOM/network test reproduced the failure before the fix and passed afterwards.
- Public cameras understand street requests such as “See what’s going on in London”, catalog coverage questions, and contextual “Show another one”. Generic camera requests use the global catalog; explicit cities remain scoped.
- Empty catalog responses receive a bounded retry and an availability error. They are not described as missing geographic coverage. Failed camera candidates have a short cooldown; still images require successful browser decoding before a verified result.
- Literal “Road Live” routes to the road controller. Air traffic commands remain separate. Failed road requests clear stale records.
- Opening or changing world views dismisses the preceding projection. Switching layers closes the previous camera/road panel and cancels pending camera selection. Return-to-core closes all these views.
- World-view acknowledgement has a deadline, one reconnection attempt, and a manual retry control, so a lost acknowledgement cannot hold subsequent controls indefinitely.
- Optional Sherpa speech recognition loads on demand unless selected as the configured backend or live speech mode. Other voice services are preserved.
- The existing “Travis, take me there” cinematic cue is preserved.

## Deployment evidence

The runtime/UI changes were applied on the existing device without replacing its project or memory databases. Originals and consistent SQLite backups were saved under `/root/.centro-jarvis/backups/world-repair-20261011T094157Z`.

At deployment, optional Sherpa process RSS went from 1,345,076 KiB to zero. Available device memory changed from 2,200,908 KiB to 3,892,904 KiB at those two measurements. Available memory fluctuates; this is recovered usage, not added physical RAM.

The catalog returned 3,518 entries initially and 3,517 at the final check. The real London road endpoint returned current data. Catalog registration does not guarantee that every operator currently serves an image or a live video stream. Road providers advertised London, Finland and New York; existing Porto/Lisbon buttons were retained, and unavailable responses are handled explicitly.

## Verification and limits

Fifteen JavaScript tests and two isolated Python voice-warmup tests passed locally and on the device before deployment. They cover routing, source scope, unavailable catalogs, projection dismissal, panel transitions and recovery from a lost acknowledgement. Browser objects in those automated controller tests are fixtures.

Full Chromium on this device exits with SIGTRAP before opening a page. An installed older headless shell launches and loads the UI, but its WebGL context is lost. Full 3D rendering, actual flight-layer data, the physical microphone and the speaker are therefore not confirmed by these tests.

## Final network evidence

After reconnecting, the owned stalled browser processes were terminated. A lightweight real browser check used the production camera catalog, camera player, camera autopilot and road panel modules, served from the real HTTP origin. The projection/globe adapter was a fixture; no real 3D or flight-data rendering was claimed.

The natural command “See what's going on in London” selected `tfl-00001.06502` (Trafalgar Square). The gateway returned HTTP 200, `X-CCTV-Source: upstream-image` and `image/jpeg`. Chromium decoded the image to 352 × 288 pixels, the image was visible, and the controller reported a verified **still image**. The source follow-up named Trafalgar Square correctly. No image-content analysis was claimed.

The same browser rendered 60 current TfL road disruption records, transitioned from Road Live to the camera and closed the camera successfully. The result was recorded at 2026-10-11 10:14:31 UTC. A changing public source may later be unavailable.

The existing London mission additions were preserved when merging index/cache versions. Cache v114 contains the corrected viewer. Entry URLs follow the existing supervisor’s expected query versions; scripts use network-first loading. No backend restart was needed for these final browser changes.

## Reproduce the network check on the host

```sh
node scripts/travis-world-network-check.cjs --fixture-html > /root/.centro-ui/travis-world-network-check.html
timeout --signal=TERM --kill-after=5s 165s node scripts/travis-world-network-check.cjs
rm /root/.centro-ui/travis-world-network-check.html
```

`PUPPETEER_PATH`, `CHROME_PATH` and `TRAVIS_BASE` can override host defaults. Browser security remains enabled. The command with `--fixture-html` only emits the isolated test page; the default command performs the network checks.

The physical microphone/speaker and the complete 3D transition remain operator checks: “See what's going on in London” → “Road Live in London” → “Show flights” → “Return to the core”. The controller tests cover those commands and lost acknowledgements, but do not prove that the actual globe rendered live aircraft.
