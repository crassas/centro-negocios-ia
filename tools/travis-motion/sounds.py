#!/usr/bin/env python3
"""Deterministic, quiet cue track. Stdlib only; no microphone or paid API.
Synth generators: whaleyxbt/claude-motion, MIT; ../../vendor/claude-motion/LICENSE.
"""
import argparse, json, math, random, struct, wave
from pathlib import Path
from vendor.synth import SR, blip, whoosh


def render(timeline, destination):
    duration = float(timeline['duration'])
    if not 0 < duration <= 120:
        raise ValueError('Timeline duration must be within 120 seconds')
    random.seed(int(timeline.get('seed', 11)))
    # One float buffer, bounded duration. Run on the rendering host, not the live UI.
    from array import array
    samples = array('f', [0]) * int(SR * duration)
    for beat in timeline['beats']:
        cue = beat.get('sound')
        if not cue:
            continue
        sound = blip(330, dur=.12, tau=.035) if cue == 'control' else whoosh(.45, 600 if cue == 'return' else 180, 180 if cue == 'return' else 800)
        start = int(float(beat['at']) * SR)
        for offset, value in enumerate(sound):
            index = start + offset
            if 0 <= index < len(samples):
                samples[index] += value * .04
    destination = Path(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(destination), 'wb') as out:
        out.setnchannels(2); out.setsampwidth(2); out.setframerate(SR)
        # Fixed headroom; sparse cue tracks should not be forced up to music loudness.
        data = bytearray()
        for sample in samples:
            value = round(max(-.5, min(.5, sample)) * 32767)
            data.extend(struct.pack('<hh', value, value))
            if len(data) >= 192000:
                out.writeframesraw(data); data.clear()
        out.writeframes(data)
    print(json.dumps({'file': str(destination), 'duration': duration, 'seed': timeline.get('seed', 11), 'peak': max(map(abs, samples), default=0)}))

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('timeline'); parser.add_argument('output')
    args = parser.parse_args()
    render(json.loads(Path(args.timeline).read_text()), args.output)
