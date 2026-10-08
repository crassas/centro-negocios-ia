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
