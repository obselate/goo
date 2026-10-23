import pathlib
import subprocess
import tempfile
import unittest


class GslintTests(unittest.TestCase):
    def test_fix_skips_symlinks(self):
        linter = pathlib.Path(__file__).resolve().parent / "bin/Release/net10.0/Goo.Gslint.dll"
        source = "package Scratch\n\nfunc Main() {\n    var value int32 = 1\n}\n"
        for option in ("--fix", "--reduce"):
            with self.subTest(option=option), tempfile.TemporaryDirectory() as temporary:
                scratch = pathlib.Path(temporary)
                root = scratch / "root"
                root.mkdir()
                outside = scratch / "root-outside"
                outside.mkdir()
                target = outside / "target.gs"
                target.write_text(source)
                (root / "file.gs").symlink_to(target)
                (root / "directory").symlink_to(outside, target_is_directory=True)
                nested = outside / "nested"
                nested.mkdir()
                (nested / "target.gs").write_text(source)
                regular = root / "regular.gs"
                regular.write_text(source)
                result = subprocess.run(
                    ["dotnet", str(linter), option, str(root)],
                    cwd=scratch, capture_output=True, text=True, check=False,
                )
                self.assertEqual(0, result.returncode, result.stdout + result.stderr)
                self.assertEqual(source, target.read_text())
                self.assertEqual(source, (nested / "target.gs").read_text())
                self.assertNotEqual(source, regular.read_text())
                self.assertIn("1 file(s)", result.stdout)


if __name__ == "__main__":
    unittest.main()
