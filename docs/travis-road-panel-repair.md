# Road Live panel visibility — 2026-10-11

The incident list can now be hidden while Road Live stays active. Selecting a row's map button hides the list after focusing its coordinates. The card close button hides only the list. The Road Live toolbar button reopens or hides the same list without requesting data again or moving the map. An explicit `Turn off Road Live` still aborts pending requests, stops refreshes and removes annotations. Existing mode-exit callers keep the full `close()` behavior.

`status().open` continues to mean Road Live is active; `status().panelOpen` describes list visibility. `hidePanel()` and `showPanel()` expose this distinction. The existing cinematic helper's `Focus on globe` / hide-overlays path now calls `hidePanel()` instead of disabling Road Live. Other live UI additions were preserved.

Validation: the controller regression test passed locally and on the device. A real Chromium DOM/CSS test with the production road and cinematic modules and real TfL data loaded 60 records and produced 18 annotations. Selecting an event, closing the card and focusing the globe retained those exact annotations while the panel computed style was `display: none`; reopening did not move the map. Explicit off cleared annotations. The map adapter was a fixture: this check does not claim a new validation of Cesium/GPU rendering.

Backup: `/root/.centro-jarvis/backups/road-panel-20261011T122716Z`. No backend restart or memory migration was required. Cache v115 and the road-panel-1 module URLs deliver the update after a page reload.

To repeat the browser check, emit `node scripts/travis-road-panel-browser-check.cjs --fixture-html` into `/root/.centro-ui/travis-road-panel-check.html`, run the script normally with a 60-second process timeout, then remove that temporary HTML file.
