import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import compendium  # noqa: E402


class BooksFile(unittest.TestCase):
    def test_no_books_file_means_no_pdf_books(self):
        here = compendium.HERE
        with tempfile.TemporaryDirectory() as d:
            compendium.HERE = d
            try:
                self.assertEqual(compendium.load_books(), [])
            finally:
                compendium.HERE = here

    def test_example_file_has_the_shape_load_books_reads(self):
        import json
        cfg = json.load(open(os.path.join(os.path.dirname(__file__), "..", "books.example.json")))
        self.assertIn("source_root", cfg)
        for b in cfg["books"]:
            for k in ("slug", "abbr", "kind", "title", "file"):
                self.assertIn(k, b)


if __name__ == "__main__":
    unittest.main()
