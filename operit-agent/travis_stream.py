"""Bounded SSE decoding and incremental speech; no tool execution or permissions."""
import json
import re
import queue
import threading
import time


class SpeechQueue:
    """Bounded producer/consumer: receiving model tokens never waits for each WAV.

    One ordered consumer owns synthesis. Cancellation drops queued speech; it
    never retries a model request or executes a tool.
    """
    def __init__(self, emit, cancelled=lambda: False, capacity=12):
        self.emit, self.cancelled = emit, cancelled
        self.queue = queue.Queue(maxsize=capacity)
        self.stopped = threading.Event()
        self.error = None
        self.thread = threading.Thread(target=self._run, daemon=True, name='travis-speech-queue')
        self.thread.start()

    def check(self):
        if self.error:
            raise self.error
        if self.cancelled() or self.stopped.is_set():
            raise BrokenPipeError('Speech delivery cancelled')

    def put(self, item):
        while True:
            self.check()
            try:
                self.queue.put(item, timeout=.1)
                return
            except queue.Full:
                continue

    def _run(self):
        try:
            while not self.stopped.is_set():
                self.check()
                try:
                    item = self.queue.get(timeout=.1)
                except queue.Empty:
                    continue
                if item is None:
                    return
                self.emit(item)
        except Exception as exc:
            self.error = exc

    def finish(self, timeout=90):
        self.put(None)
        deadline = time.monotonic()+timeout
        while self.thread.is_alive():
            self.check()
            if time.monotonic() >= deadline:
                self.stop()
                raise TimeoutError('Speech delivery deadline exceeded')
            self.thread.join(.1)
        if self.error:
            raise self.error

    def stop(self):
        self.stopped.set()


def read_sse(response, on_delta=None, limit=3000, require_done=False):
    parts = []
    size = 0
    complete = False
    for raw in response:
        line = raw.decode('utf-8').strip()
        if not line.startswith('data:'):
            continue
        data = line[5:].strip()
        if data == '[DONE]':
            complete = True
            break
        item = json.loads(data)
        if item.get('error') or item.get('errors'):
            raise RuntimeError('Speech model stream failed')
        choices = item.get('choices') or []
        if choices and choices[0].get('finish_reason') == 'stop':
            complete = True
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
    if require_done and not complete:
        raise RuntimeError('Model response interrupted before completion')
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
            target = 48 if self.count == 0 else 240
            if (not boundary or boundary > target) and len(self.pending) > target:
                boundary = self.pending.rfind(' ', 16, target)
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
