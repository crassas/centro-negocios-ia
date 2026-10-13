#!/usr/bin/env python3
"""Differential parity checks against Travis' current Python implementation."""
import random
import re
import unittest
import unicodedata
from travis_rust_memory import score_overlaps

STOPWORDS = {"sobre", "muito", "entao", "quando", "como", "para", "esta",
             "estou", "este", "uma", "uns", "umas", "pelo", "pela", "pelos",
             "elas", "eles", "com", "sem", "sob", "por", "que", "dos",
             "das", "nos", "nas", "the", "and", "from"}

def _tokens(value):
    normal = "".join(c for c in unicodedata.normalize("NFD", value.lower())
                     if not unicodedata.combining(c))
    return set(re.findall(r"[a-z0-9]+", normal))

def python_overlap(query, rows):
    wanted = {w for w in _tokens(query) if len(w) >= 3 and w not in STOPWORDS}
    return [float(2 * len(wanted & _tokens(row["title"])) +
                  len(wanted & _tokens(row["body"]))) for row in rows]

class RustMemoryParityTests(unittest.TestCase):
    def test_fixed_queries_with_unicode(self):
        rows = [
            {"title": "Memória BEATRIZ", "body": "Entrega da Beatriz em até 72 horas"},
            {"title": "Pentehouse", "body": "Barbearia na Constituição, Porto"},
            {"title": "São Roque da Lameira", "body": "Pizza, kebab e entrega de refeições"},
            {"title": "Rust 🦀", "body": "Código rápido e seguro"},
            {"title": "", "body": ""},
        ]
        for query in ["memória Beatriz", "PENTE HOUSE", "porto porto pizzá",
                      "o código em Rust", "🎤 🎞️", "entrega da Beatriz",
                      "Sobre a esta entrega", "na Constituição, Porto"]:
            with self.subTest(query=query):
                self.assertEqual(score_overlaps(query, rows), python_overlap(query, rows))

    def test_large_deterministic_batch(self):
        rng = random.Random(20261013)
        corpus = ["Coimbra", "Porto", "câmara", "voz", "São Roque",
                  "engenharia", "memória", "página", "Rust", "YouTube",
                  "travis", "rápido"]
        rows = [{"title": " ".join(rng.choices(corpus, k=rng.randint(1, 8))),
                 "body": " ".join(rng.choices(corpus, k=rng.randint(1, 12)))}
                for _ in range(500)]
        for query in ["Porto", "SÃO ROQUE MEMÓRIA", "câmara do Travis",
                      "YouTube voz", "holograma não visto"]:
            self.assertEqual(score_overlaps(query, rows), python_overlap(query, rows))

    def test_over_limit_protection(self):
        with self.assertRaises(ValueError):
            score_overlaps("Porto", [{"title": "a", "body": "b"}] * 501)

if __name__ == "__main__":
    unittest.main()
