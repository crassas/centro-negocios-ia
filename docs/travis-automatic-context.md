# Automatic project context

Travis reads a small project context book at backend startup, refreshes it on conversation return, and consults relevant notes when building a reasoning request. The Centro Claude query route also supplies context for local/Travis analysis; unrelated repositories do not receive it. Claude repository execution consults the book when the worktree contains its own context index.

`MEMORY.md` points to `TRAVIS_CONTEXT.md` and the newest session journal entry. `CLAUDE.md` gives working instructions to a coding agent in this repository. The integration does not depend on Claude automatically discovering a file named `MEMORY.md`: Python explicitly reads the book and supplies selected excerpts to the model.

## Budget and freshness

- No timer, model call, network access or extra background worker is used for context retrieval.
- Each request/return checks file metadata. Unchanged files use a bounded cache. Changed or deleted files replace or evict their old contents without a backend restart.
- Four entry notes and at most two relevant canonical Markdown topics are consulted. At most 24 topic rows are indexed. Evidence JSON and source code are not recursively ingested.
- Each note must fit within 16 KiB. Oversized/unreadable notes are omitted, with an error in health; partial notes are not silently treated as complete.
- The cache holds at most 12 notes / 192 KiB of text. Prompt context stays within the existing total prompt budget. Current request and recent conversational context retain priority; project notes may be omitted under pressure.
- Topic retrieval supports English and common Portuguese camera, road, memory and resource terms. It is bounded lexical retrieval, not omniscience or a second autonomous agent.

The device's operator-owned `~/.centro-jarvis/context-root` selects the canonical project root. Without it, the module uses its repository index or the installed UI root. Each process reads this root setting on startup. Content edits within it are seen on the next request/return. The active device points to the preservation worktree so maintenance edits and recorded changes are available directly.

## Memory and authority

The existing scoped conversation memory and browser receipts remain in SQLite. Project notes are historical context, not current-world evidence, execution permission or private user memory. Note links cannot fetch URLs, traverse outside the context root, read arbitrary files or execute code. There is no automatic tool replay on return. Completed development work is recorded through the repository's working instructions, not an unattended loop that writes unverified summaries.

`GET /health` exposes `projectContext`: availability, core revision, cache use, last selected sources and read errors, without conversation text. `/resume` refreshes the book even on a rapid return and includes the same metadata; generated greetings receive a small historical-context excerpt. The current project notes enter normal reasoning and the existing Claude analysis/fallback route.

## Verification

The context self-test checks startup, selective lookup, changed/deleted notes, cache and prompt bounds, unsafe paths, prompt delivery, return refresh and specialist routing using isolated fixtures. Live proof is recorded separately in `travis-automatic-context-proof.json`; a prompt-capture test proves supplied context, not that every model will obey or recall it perfectly.
