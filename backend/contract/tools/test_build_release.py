import tempfile
import unittest
from pathlib import Path
from zipfile import ZipFile

from build_release import package_version, stage_package, verify_wheel


class ReleaseTests(unittest.TestCase):
    def test_tag_versions(self) -> None:
        for tag, expected in (("v1.2.3", "1.2.3"), ("v0.1.0-alpha", "0.1.0a0"), ("v0.1.0-alpha.12", "0.1.0a12")):
            with self.subTest(tag=tag):
                self.assertEqual(package_version(tag), expected)
        for tag in ("1.2.3", "v01.2.3", "v1.2", "v1.2.3-beta", "v1.2.3-alpha.01", "v1.2.3\n"):
            with self.subTest(tag=tag), self.assertRaises(ValueError):
                package_version(tag)

    def test_staging_changes_only_copy(self) -> None:
        source = Path(__file__).resolve().parents[1]
        original = (source / "pyproject.toml").read_bytes()
        with tempfile.TemporaryDirectory() as temporary:
            staged = Path(temporary) / "contract"
            stage_package(source, staged, "1.2.3a4")
            self.assertIn('version = "1.2.3a4"', (staged / "pyproject.toml").read_text())
            self.assertTrue((staged / "src/kochwiki_contract/py.typed").is_file())
        self.assertEqual((source / "pyproject.toml").read_bytes(), original)

    def test_wheel_metadata_must_match_tag(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            wheel = Path(temporary) / "kochwiki_contract-1.2.3-py3-none-any.whl"
            with ZipFile(wheel, "w") as archive:
                archive.writestr("kochwiki_contract-1.2.3.dist-info/METADATA", "Name: kochwiki-contract\nVersion: 9.9.9\n")
                archive.writestr("kochwiki_contract/py.typed", "")
            with self.assertRaisesRegex(ValueError, "metadata"):
                verify_wheel(wheel, "1.2.3")
            with self.assertRaisesRegex(ValueError, "filename"):
                verify_wheel(wheel, "1.2.4")
