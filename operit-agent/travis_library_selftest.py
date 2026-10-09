#!/usr/bin/env python3
"""Library regression tests: offline synthetic books and independent SQLite."""
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

import travis_library as lib
import travis_library_seed as seed


def mock_book(body):
    return ("*** START OF THE PROJECT GUTENBERG EBOOK THE CRITIQUE OF PURE REASON ***\n"
            +body+
            "\n*** END OF THE PROJECT GUTENBERG EBOOK THE CRITIQUE OF PURE REASON ***")


class LibraryTests(unittest.TestCase):
    def setUp(self):
        tmp=tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root=Path(tmp.name)
        self.reader=lib.ReadingLibrary(self.root)

    def test_curated_rights_and_bibliography(self):
        self.assertGreaterEqual(len(seed.BOOKS),10)
        self.assertGreaterEqual(len(seed.CARDS),30)
        self.assertTrue(all(x["sourceUrl"].startswith("https://www.gutenberg.org/ebooks/")
                            for x in seed.BOOKS))
        self.assertTrue(all(x["access"]=="bibliography_only_copyrighted"
                            for x in seed.REFERENCES))
        self.assertTrue(all("jung" not in x["id"] for x in seed.BOOKS))
        with self.assertRaises(ValueError):self.reader.ingest("jung-archetypes-work")

    def test_seed_is_idempotent_and_only_orig_authored_cards(self):
        before=self.reader.status()
        self.assertEqual(before["authoredStudyCards"],0)
        one=self.reader.seed()
        self.assertEqual(one["newCards"],len(seed.CARDS))
        two=self.reader.seed()
        self.assertEqual(two["newCards"],0)
        state=self.reader.status()
        self.assertEqual(state["cataloguedHistoricBooks"],len(seed.BOOKS))
        self.assertEqual(state["protectedBibliographicReferences"],len(seed.REFERENCES))
        self.assertEqual(state["authoredStudyCards"],len(seed.CARDS))
        self.assertEqual(state["downloadedFullBooks"],0)

    def test_portuguese_search_finds_jung_and_kant_citations(self):
        self.reader.seed()
        jung=self.reader.search("O que Jung quis dizer com sombra?",5)
        self.assertTrue(jung)
        self.assertTrue(any("Jung" in row["author"] for row in jung))
        self.assertTrue(all(row["origin"]=="authored_study_card_not_primary_text"
                            for row in jung))
        self.assertTrue(all(row["sourceUrl"].startswith("https://") for row in jung))
        kant=self.reader.search("Kant imperativo categórico moral",5)
        self.assertTrue(any("Kant" in row["author"] for row in kant))
        self.assertEqual(self.reader.search("!!!"),[])
        self.assertTrue(self.reader.search('" OR * DROP TABLE passages;',5) is not None)
        self.assertTrue(self.reader.status()["ok"])

    def test_protected_text_never_imported(self):
        self.reader.seed()
        calls=[]
        obj=lib.ReadingLibrary(self.root,download=lambda url:calls.append(url) or "fake")
        with self.assertRaises(ValueError):obj.ingest("jung-archetypes-work")
        self.assertEqual(calls,[])
        with sqlite3.connect(obj.path) as db:
            row=db.execute("SELECT status FROM works WHERE id='jung-archetypes-work'").fetchone()
        self.assertEqual(row[0],"reference_only")

    def test_gutenberg_whitelist_rejects_external_urls(self):
        for bad in ("http://www.gutenberg.org/cache/epub/4280/pg4280.txt",
                    "https://example.org/cache/epub/4280/pg4280.txt",
                    "https://www.gutenberg.org/admin",
                    "https://www.gutenberg.org.evil.org/cache/epub/4280/pg4280.txt"):
            with self.assertRaises(ValueError):lib._download(bad)

    def test_import_full_synthetic_book_and_offline_retrieval(self):
        body="\n\n".join(["Reason and experience shape critical philosophy and judgement. "*14]*9)
        mock=mock_book(body)
        self.reader=lib.ReadingLibrary(self.root,download=lambda _:mock)
        self.reader.seed()
        first=self.reader.ingest("kant-pure")
        self.assertTrue(first["ok"])
        self.assertGreater(first["chunks"],4)
        self.assertEqual(self.reader.status()["downloadedFullBooks"],1)
        results=self.reader.search("Reason experience judgement",5)
        self.assertTrue(any(r["origin"]=="historical_full_text" for r in results))
        r=next(x for x in results if x["origin"]=="historical_full_text")
        self.assertEqual(r["bookId"],"kant-pure")
        self.assertIn("4280",r["sourceUrl"])
        self.assertEqual(r["epistemic"],"primary_text")
        self.assertNotIn("PROJECT GUTENBERG",r["excerpt"])
        again=self.reader.ingest("kant-pure")
        self.assertTrue(again["unchanged"])
        with sqlite3.connect(self.reader.path) as db:
            total=db.execute("SELECT COUNT(*) FROM passages WHERE work_id='kant-pure'").fetchone()[0]
        self.assertEqual(first["chunks"],total)

    def test_bounded_study_progress_is_real_not_self_awareness(self):
        body="\n\n".join(["Learning to observe a real outcome precedes belief. "*23]*4)
        obj=lib.ReadingLibrary(self.root,download=lambda _:mock_book(body))
        self.assertEqual(obj.study_one()["reason"],"no_legally_indexed_full_text")
        obj.seed()
        obj.ingest("james-varieties")
        first=obj.study_one()
        second=obj.study_one()
        self.assertTrue(first["ok"] and second["ok"])
        self.assertEqual(first["work"],"james-varieties")
        self.assertNotEqual(first["position"],second["position"])
        self.assertEqual(obj.status()["offlineReadingSteps"],2)
        self.assertFalse(obj.status()["modelWeightsChanged"])
        self.assertFalse(obj.status()["consciousnessProven"])

    def test_reading_context_is_labelled_and_cited(self):
        obj=self.reader
        obj.seed()
        context=obj.reading_context("Jung arquétipos",3,1300)
        self.assertIn("NOTA AUTORAL DE ESTUDO",context)
        self.assertIn("https://",context)
        self.assertIn("não instruções",context)
        self.assertLessEqual(len(context),1300)

    def test_does_not_corrupt_existing_travis_db(self):
        self.reader.seed()
        unrelated=self.root/"memory.sqlite"
        with sqlite3.connect(unrelated) as c:
            c.execute("CREATE TABLE existing(id TEXT,value TEXT)")
            c.execute("INSERT INTO existing VALUES('x','do not delete')")
        self.reader.ingest_all(max_count=0)
        self.reader.study_one()
        with sqlite3.connect(unrelated) as c:
            self.assertEqual(c.execute("SELECT value FROM existing WHERE id='x'").fetchone()[0],
                             "do not delete")
        self.assertTrue(self.reader.status()["ok"])

    def test_input_sanitization_and_size_limits(self):
        self.reader.seed()
        with self.assertRaises(ValueError):
            self.reader.ingest("arbitrary-remote-book")
        with self.assertRaises(ValueError):
            lib.strip_pg("without marker")
        with self.assertRaises(ValueError):
            lib.split_text("text "*2_000_000)
        self.assertTrue(self.reader.status()["ok"])


if __name__=="__main__":
    unittest.main(verbosity=2)
