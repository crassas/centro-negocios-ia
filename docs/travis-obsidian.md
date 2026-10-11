# Same-device Obsidian connection

The Android folder the user-created **Cofre Travis** under Android Documents is prepared as a dedicated vault. Its `.obsidian` configuration folder was observed. The existing name has a trailing space; the path setting preserves it. Reading edited notes from the active Travis HTTP route is verified separately from app UI interaction.

The running Travis context book reads the canonical repository as before and also reads `TRAVIS_VAULT_INDEX.md` from the operator-owned path in `~/.centro-jarvis/context-vault`. Only its linked Markdown topics under `docs/` are eligible for retrieval. Existing technical context stays in the repository; SQLite conversations remain in their current databases. Vault notes are operator-provided context and are labelled unverified. An edited topic is seen on the next relevant reasoning request or return, without a continuous file watcher.

The two sources share the existing limits: at most 24 indexed topics, at most two selected topic notes per request, 16 KiB per file, 12 cached files / 192 KiB total cached text, and the existing total prompt budget. Explicit `ContextBook(root)` instances stay isolated from the Android vault unless a vault argument is supplied. This prevents unrelated repository executors and isolated tests from loading the user's notes. Files outside either configured root, non-Markdown links and oversized notes are rejected.

The initial vault contains a navigation index, a memory pointer, an operational goal, an agent procedure and a dated journal. Repository templates contain only the generated starter content; future private vault edits must not be copied into Git or proof reports automatically. Obsidian does not need to be installed in the Ubuntu environment or run as a background process to support this file connection.

## Operational target

70% means at least 14 verified successes in a fixed 20-task benchmark with declared expected outcomes. It is a proposed task-completion target, not an AGI score or a fresh benchmark result. The existing coordinator/continuity runtime supplies the execution cycle; this change adds its editable context source. No additional autonomous daemon, permission mode or cloud service is enabled.

## Verification

Tests cover shared-folder lookup, edits without restart, cache reuse/bounds, missing-vault fallback and path isolation, plus the previous context/continuity regressions. Live evidence is recorded in `travis-obsidian-proof.json`. A temporary factual marker in a starter note checks whether the active HTTP reasoning route actually receives a changed note; the marker is removed afterwards. Obsidian app interaction remains a user step.
