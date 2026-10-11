# Travis service context

This is a service map, not a current health receipt. Check the relevant endpoint before relying on it. Updated 2026-10-11.

| Component | Location | Role / check |
| --- | --- | --- |
| Voice and tools router | /root/jarvis_local.py; localhost:8770 | GET /health; resources, projectContext and workflows report their own state |
| Existing execution server | /root/centro_server.py; localhost:8765 | GET /health; existing repository execution permissions remain authoritative |
| Supervisor | /root/centro_station.py | Preserve the running recovery system; never restart an active request |
| UI | /root/.centro-ui | Served by router; one canonical cinematic-shell import expected by watchdog |
| Globe renderer | localhost:4173 | Existing GEV renderer; background release and restoration via browser lifecycle |
| Camera gateway | localhost:4187 | Existing camera sources; cached images are not verified live video |
| Conversation / coordination | /root/.centro-jarvis/memory.sqlite and coordination.sqlite | Existing private state, never export to Git or replace with Markdown |
| Requested check workflows | /root/.centro-jarvis/workflows.sqlite | Up to five registered read-only checks, durable bounded summaries, idle recovery |
| Obsidian context | operator config /root/.centro-jarvis/context-vault | User-created Cofre Travis in Android Documents; preserve its trailing space |

## Execution and recovery

Example: “Check system status and memory.” The existing planner selects two registered read-only tools. Each result summary and timestamp is committed to SQLite before the next check. The existing asynchronous voice task keeps its workflow ID. If the router restarts, the recovery worker resumes unfinished checks and the same task's status can report the recovered result. Completed checkpoints are not replayed. A process death between a read and its commit may repeat that one read: this is at-least-once recovery, not exactly-once execution.

Recovery checks every five seconds, executes only pending requests, yields between tools to foreground work and the brain pause control, and never calls a model itself. It does not read all vault notes, invent goals, send mail, publish changes or replay write operations. Failed checks are recorded once; completed workflows with failed checks remain partial and unverified. Pending requests expire after 24 hours. Queue: sixteen pending workflows; history: at most 101 completed/expired rows following submission. Summaries are bounded and private. Existing browser action receipts remain separate.

Obsidian can close without removing saved Markdown or stopping this runner while the router process survives. Android can kill the hosting process too; checkpoints survive, but no process executes while Android has stopped its host. Restart recovery requires the existing supervisor/host to be running again.

## Android closure investigation

The fresh Cofre Travis had no enabled community-plugin list, empty app/appearance settings, and small starter notes. No Android logcat, dumpsys, adb or shell access is exposed by this Ubuntu session. The cause of the reported Obsidian closures is therefore unverified. Do not claim a battery-setting change fixes a crash or prevents low-memory termination. Diagnose actual Android exit reasons/stack traces, app version and WebView before changing system settings. No plugin, theme, OS setting or app data was removed.

## Recorded validation

On 2026-10-11: nine recovery tests and fourteen context tests passed. An actual English HTTP request completed both system and memory checks. A separate child process exited after its first real read was checkpointed; the deployed recovery worker completed the remaining read roughly four seconds later and kept the first checkpoint unchanged. SQLite checks passed. See the repository proof file docs/travis-workflow-recovery-proof.json. This tests requested read-only recovery, not unrestricted autonomous work or physical phone audio/GPU. Android closure cause remains unverified.
