import os
import unittest

IMPORTER = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
REPO = os.path.dirname(IMPORTER)
README = os.path.join(IMPORTER, "README.md")
IMPORTING = os.path.join(REPO, "docs", "IMPORTING.md")
INSTALL = os.path.join(REPO, "docs", "INSTALL.md")


def read(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


class Docs(unittest.TestCase):
    def test_docs_exist(self):
        for path in (README, IMPORTING, INSTALL):
            self.assertTrue(os.path.isfile(path), path)

    def test_each_doc_names_the_2024_library(self):
        for path in (README, IMPORTING, INSTALL):
            self.assertIn("WotC 2024", read(path), path)

    def test_sources(self):
        for path in (README, IMPORTING):
            text = read(path)
            self.assertIn("sources-2024.json", text, path)
            self.assertNotIn("compendium/5e2024/", text, path)

    def test_operations(self):
        text = read(IMPORTING)
        for w in ("sync --libs", "vault-count", "verify.py"):
            self.assertIn(w, text, w)


if __name__ == "__main__":
    unittest.main()
