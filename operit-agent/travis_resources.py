"""Release only idle, owned inference workers; keep persistent memory untouched."""
import threading
import time
from pathlib import Path


def idle_timeout(value):
    try:
        return max(60, min(3600, int(value)))
    except (TypeError, ValueError):
        return 180


def rss_kib(process):
    if process is None or process.poll() is not None:
        return 0
    try:
        for line in Path(f'/proc/{process.pid}/status').read_text().splitlines():
            if line.startswith('VmRSS:'):
                return int(line.split()[1])
    except (OSError, ValueError, AttributeError):
        pass
    return 0


class IdleWorkerPool:
    def __init__(self, workers, idle_seconds=180, interval=30, clock=time.monotonic):
        self.workers=dict(workers)
        self.idle_seconds=idle_timeout(idle_seconds)
        self.interval=interval
        self.clock=clock
        self.released=0
        self.errors={}
        self._stop=threading.Event()
        self._thread=None

    def sweep(self):
        released=[]
        for name, worker in self.workers.items():
            # A request owns this same lock from model start through its final result.
            if not worker.lock.acquire(blocking=False):
                continue
            try:
                process=worker.process
                if process is not None and self.clock()-worker.last_used >= self.idle_seconds:
                    worker.stop()
                    released.append(name)
                    self.released+=1
                    self.errors.pop(name, None)
            except Exception as exc:
                self.errors[name]=type(exc).__name__
            finally:
                worker.lock.release()
        return released

    def snapshot(self):
        rows=[]
        for name, worker in self.workers.items():
            process=worker.process
            resident=process is not None and process.poll() is None
            rows.append({'name':name, 'resident':resident, 'rssKiB':rss_kib(process),
                         'idleSeconds':round(max(0, self.clock()-worker.last_used), 1) if resident else None})
        return {'policy':'on-demand-with-idle-release', 'idleTimeoutSeconds':self.idle_seconds,
                'sweepIntervalSeconds':self.interval, 'residentWorkers':sum(r['resident'] for r in rows),
                'workerRssKiB':sum(r['rssKiB'] for r in rows), 'releasedWorkers':self.released,
                'errors':dict(self.errors), 'workers':rows}

    def start(self):
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        def run():
            while not self._stop.wait(self.interval):
                self.sweep()
        self._thread=threading.Thread(target=run, name='travis-resource-rest', daemon=True)
        self._thread.start()

    def stop(self):
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=3)
