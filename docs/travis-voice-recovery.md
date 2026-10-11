# Voice conversation recovery

Updated 2026-10-11. The user's reported symptoms are variable transcription delay, stuck replies and disappearing audio after greetings or answers. The phone microphone/speaker failure has not been directly reproduced in this session.

## Implemented changes

- The incremental reader stops on the protocol done event rather than waiting for transport EOF. It limits no-progress reads to 25 seconds, preserves already received audio as an interrupted answer, cancels the reader without another unbounded wait and never repeats a possibly executed tool request.
- Audio context resume is bounded to four seconds; decoding to eight seconds. Closed contexts are recreated. Playback completion now has a wall-clock deadline (decoded duration plus five seconds), cleans its nodes and releases the conversation even if the context clock freezes. Context suspension/interruption rejects the playback and releases its state. Delivery is confirmed after actual playback completion, not merely after starting a source. These are client behaviours tested with the actual function and a controlled AudioContext, not physical audio hardware.
- Opening a conversation requests asynchronous preparation of the selected language's STT and TTS only. Global four-worker startup remains off. A preparation request grants no new tools or cloud access. The existing 180-second idle release remains active. The acknowledgement means preparing, not verified model readiness.
- Browser cache is v117-voice-recovery; the single canonical voice-first-cinema-2 shell import and world/resource modules remain in place.

## Evidence

Eleven recovery checks passed: four real HTTP stream cases, two deadline cases and five cases against the extracted actual playback function. The real local English synthesizer-to-recognizer path returned the intended system/memory request. Before session preparation, recognition took 6.209 seconds on the first call and 3.679 on the next. With the selected session preparation, the test recognition took 3.370 seconds; synthesis took 4.649 seconds including asynchronous preparation still in progress. These isolated measurements do not establish a general speedup or include VAD delay, physical microphone capture, reasoning or physical speaker playback. Only stt-fast and tts-en became resident in this English test. SQLite checks passed; served modules matched installed source. See [proof](travis-voice-recovery-proof.json).

## Operating procedure

Reload the Travis page to obtain updated client modules. Open a voice conversation in English or Portuguese and use several short turns. Check speech-end-to-transcript, transcript-to-reply and first-audio timing in diagnostics. If audio needs a foreground gesture, tap the interface rather than restarting the server. On interrupted answers, preserve completed actions and their receipts; only request continuation of missing speech. The cofre contains concise procedure notes; private memory remains in SQLite.

## Sources and limits

The design uses documented turn lifecycle, incremental audio and interruption handling patterns: https://developers.openai.com/api/docs/guides/realtime-conversations . Web Audio context suspension is documented at https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/state . These sources guide the local implementation; no OpenAI API subscription, provider change or paid route was enabled. OpenAI Realtime voice-to-voice is a different architecture from the current local STT/model/TTS pipeline. Live transcription remains disabled because its existing fallback is not verified for unrestricted speech. Hardware transcription still takes seconds; the implementation does not claim ChatGPT-equivalent latency.
