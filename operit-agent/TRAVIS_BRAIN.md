# Travis functional brain

`travis_brain.py` coordinates existing routing, tool execution, factual memory and
result verification. Anatomical names are functional analogies, not a biological
simulation. The system does not establish subjective experience or consciousness.

## Foreground behaviour

Each routed request wakes the runtime and takes priority over reflection. Events
record input, planning, recall, execution and verification. Consolidated episodes
can become context for later relevant requests, with their original verification
status and source IDs. The cerebral view displays these observed events; it does
not report individual biological neuron activity.

## Autonomous cycles

The daemon starts with the local Jarvis server, independently of the open UI.
After 180 seconds without routed requests, it reviews up to 80 completed tasks
and up to 160 active factual memories. It retains task episodes and lexical
associations in its own `brain.sqlite`. The authoritative factual store remains
unchanged. A cycle runs at most every 30 minutes, at most eight times per UTC day,
and only with at least 512 MB available memory and 128 MB free disk space.

Each cycle saves a counterfactual dream and a philosophical reflection. Topics
rotate through evidence, responsibility, memory and autonomy. If the local model
on port 8771 is available, it can propose bounded text drafts. Invalid output or
model failure leaves an explicitly identified structured simulation. There are
no cloud calls, tool actions or automatic promotions of hypotheses into facts.
New requests cancel the background model stream; socket timeout is five seconds.

Cycles require the local service and device to remain running. Android process
suspension stops progress until the service resumes. This is not model weight
training or a recreation of biological sleep.

## Controls and state

The CÉREBRO view has a diary and persistent pause/resume control. ROSTO contains
no cerebral overlay. `/brain/state` and `/brain/control` accept local-origin POST
requests under the existing cockpit policy. `/brain/control` requires a boolean
`paused` field. The diary includes source IDs and explicit hypothesis labels.
Natural requests include “estado do cérebro”, “o que sonhaste”, “pausa os sonhos”
and “retoma os sonhos”.

Tests: `python3 operit-agent/travis_brain_selftest.py`, plus the existing cognitive,
reflexion and Jarvis suites. Browser verification must cover the actual cerebral
geometry, current backend telemetry, diary, pause persistence and clean face view.

## Continuous memory learning

The executable memory prototype is now adapted to this existing runtime. There
is no second worker, replacement `travis_core.py`, additional model or new package.
Each completed `route()` request records an episode immediately, including the
session, project and external verification verdict. The existing startup and
supervisor continue to own the background cycle.

Later reasoning prompts retrieve relevant episodes from the same session and
project. Candidates are ranked by lexical relevance (0.60), learned utility
(0.35) and recency (0.05). Each utility starts at 0.5. An observed success or
failure updates it with `Q := Q + 0.2 * (reward - Q)`. Unknown model answers
remain unverified and receive no automatic positive reward. Only complete
memory records actually included in the prompt receive source credit. Credit
assignment is approximate; these weights are engineering defaults, not an
experimentally established optimum.

The user can explicitly rate a recent answer in the same conversation:

- “A resposta anterior estava correcta.” / “A resposta anterior estava errada.”
- “A resposta anterior foi útil.” / “A resposta anterior não foi útil.”
- “The previous answer was useful.” / “The previous answer was wrong.”

These commands are handled without model inference. Repeating the same rating
does not reinforce it again. A contradictory second rating is rejected. A local
POST to `/brain/feedback` accepts `{session, runId, accepted}`; `accepted` must
be a boolean and `runId` must identify a recent response in that session. This
route follows the existing local-origin policy. Sessions isolate conversations,
but are not a new multi-user authentication boundary. User ratings measure
usefulness; they never turn an answer into an externally verified fact.

The response exposes a `learning` receipt. `/brain/state` reports observed runs,
feedback events, weighted memories and the background heartbeat. These are
actual counts. They do not establish a real-world accuracy improvement. If a
memory write fails after a tool action, the response reports the learning
failure without repeating the external action.

SQLite migration adds tables without rewriting factual memory. Before updating
an existing brain database, the first new startup creates a consistent SQLite
backup at `~/.centro-jarvis/brain.pre-learning-v1.sqlite`. Utilities survive
restart and periodic consolidation. Old episodes without a session stay in the
legacy sessionless scope; they are not silently mixed into another conversation.

The integrated regression tests exercise route → persisted episode → explicit
feedback → restart → prompt retrieval, with a stubbed model and isolated stores.
They also cover unknown outcomes, duplicated feedback, project/session isolation,
context-budget exclusion and failure after a successful tool action. A live
device check still requires the updated router to be running; a Git commit or
passing unit tests alone does not prove deployment.
