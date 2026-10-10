"""Bounded SSE decoding and incremental speech; no tool execution or permissions."""
import json
import re


def read_sse(response, on_delta=None, limit=3000):
    parts = []
    size = 0
    for raw in response:
        line = raw.decode('utf-8').strip()
        if not line.startswith('data:'):
            continue
        data = line[5:].strip()
        if data == '[DONE]':
            break
        item = json.loads(data)
        if item.get('error') or item.get('errors'):
            raise RuntimeError('Speech model stream failed')
        choices = item.get('choices') or []
        delta = item.get('response') or (choices[0].get('delta', {}).get('content') if choices else '') or ''
        if not isinstance(delta, str):
            continue
        delta = delta[:max(0, limit-size)]
        size += len(delta)
        parts.append(delta)
        if delta and on_delta:
            on_delta(delta)
        if size >= limit:
            break
    text = ''.join(parts).strip()
    if not text:
        raise RuntimeError('Empty model stream')
    return text


class SpeechChunks:
    """Speak complete sentences, or bounded word groups for long sentences."""
    def __init__(self, emit):
        self.emit = emit
        self.pending = ''
        self.count = 0

    def feed(self, delta):
        self.pending += delta
        while self.pending:
            stop = re.search(r'[.!?](?:["”])?(?=\s)', self.pending)
            boundary = stop.end() if stop else 0
            target = 140 if self.count == 0 else 240
            if not boundary and len(self.pending) > target:
                boundary = self.pending.rfind(' ', 30, target)
            if boundary <= 0:
                return
            text, self.pending = self.pending[:boundary], self.pending[boundary:]
            self._emit(text)

    def _emit(self, text):
        if text.strip():
            self.emit(text.strip())
            self.count += 1

    def finish(self):
        self._emit(self.pending)
        self.pending = ''
