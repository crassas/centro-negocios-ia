#!/usr/bin/env python3
"""Synthetic memory batch benchmark. No user data or automatic activation."""
import argparse
import random
import statistics
import time
from travis_rust_memory import score_overlaps
from travis_rust_memory_selftest import python_overlap

def measure(fn, repeats):
    data = []
    for _ in range(repeats):
        start = time.perf_counter_ns()
        fn()
        data.append((time.perf_counter_ns() - start) / 1e6)
    return statistics.median(data)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--records", type=int, default=500)
    parser.add_argument("--repeats", type=int, default=60)
    args = parser.parse_args()
    if not 1 <= args.records <= 500 or not 3 <= args.repeats <= 1000:
        parser.error("records 1..500, repeats 3..1000")
    rng = random.Random(146)
    words = ["Coimbra", "Porto", "memória", "câmara", "Travis", "Beatriz",
             "interação", "vídeo", "página", "microfone", "Rust", "AI"]
    rows = [{"title": " ".join(rng.choices(words, k=4)),
             "body": " ".join(rng.choices(words, k=17))} for _ in range(args.records)]
    query = "memória do Travis em Porto com vídeo e voz"
    reference = python_overlap(query, rows)
    assert score_overlaps(query, rows) == reference, "Paridade falhou"
    a = measure(lambda: python_overlap(query, rows), args.repeats)
    b = measure(lambda: score_overlaps(query, rows), args.repeats)
    print(f"Parity=PASS records={args.records} Python={a:.3f}ms Rust-FFI={b:.3f}ms relative_change={(a-b)*100/a:+.1f}%")
    print("Synthetic only: benchmark total recall and ARM64 before activation.")

if __name__ == "__main__":
    main()
