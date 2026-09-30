import argparse
import hashlib
import json
import re
import shutil
import subprocess
import sys
import tempfile
from email.parser import Parser
from pathlib import Path
from zipfile import ZipFile


def package_version(tag: str) -> str:
    number = r"(?:0|[1-9]\d*)"
    match = re.fullmatch(rf"v({number}\.{number}\.{number})(?:-alpha(?:\.({number}))?)?", tag)
    if match is None:
        raise ValueError("Expected v1.2.0, v1.2.0-alpha, or v1.2.0-alpha.123 (no leading zeros)")
    suffix = f"a{match[2] or '0'}" if "-alpha" in tag else ""
    return f"{match[1]}{suffix}"


def stage_package(source: Path, destination: Path, version: str) -> None:
    destination.mkdir()
    for name in ("README.md", "pyproject.toml"):
        shutil.copyfile(source / name, destination / name)
    shutil.copytree(source / "src", destination / "src", ignore=shutil.ignore_patterns("__pycache__", "*.egg-info"))
    metadata = destination / "pyproject.toml"
    original = metadata.read_text(encoding="utf-8")
    updated, count = re.subn(r'^version = "[^"]+"$', f'version = "{version}"', original, flags=re.MULTILINE)
    if count != 1:
        raise ValueError("Expected exactly one package version in pyproject.toml")
    metadata.write_text(updated, encoding="utf-8")


def verify_wheel(wheel: Path, version: str) -> None:
    if wheel.name != f"kochwiki_contract-{version}-py3-none-any.whl":
        raise ValueError("Wheel filename does not match the release version")
    with ZipFile(wheel) as archive:
        metadata = Parser().parsestr(archive.read(f"kochwiki_contract-{version}.dist-info/METADATA").decode("utf-8"))
        if metadata["Name"] != "kochwiki-contract" or metadata["Version"] != version:
            raise ValueError("Wheel metadata does not match the release version")
        if "kochwiki_contract/py.typed" not in archive.namelist():
            raise ValueError("Wheel is missing py.typed")


def build_release(tag: str, commit: str, repository: str, output: Path) -> Path:
    version = package_version(tag)
    if re.fullmatch(r"[0-9a-f]{40}", commit) is None:
        raise ValueError("Expected a full source commit SHA")
    if re.fullmatch(r"[\w.-]+/[\w.-]+", repository) is None:
        raise ValueError("Expected repository owner/name")
    output = output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    if any(output.iterdir()):
        raise ValueError("Release output directory must be empty")
    source = Path(__file__).resolve().parents[1]
    with tempfile.TemporaryDirectory(prefix="kochwiki-contract-") as temporary:
        staged = Path(temporary) / "contract"
        stage_package(source, staged, version)
        subprocess.run(
            [sys.executable, "-m", "pip", "wheel", "--no-deps", str(staged), "--wheel-dir", str(output)],
            check=True,
        )
    wheels = list(output.glob("*.whl"))
    if len(wheels) != 1:
        raise ValueError("Expected exactly one contract wheel")
    wheel = wheels[0]
    verify_wheel(wheel, version)
    checksum = hashlib.sha256(wheel.read_bytes()).hexdigest()
    provenance = {
        "repository": repository, "commit": commit, "tag": tag,
        "package": "kochwiki-contract", "version": version,
        "wheel": wheel.name, "sha256": checksum,
    }
    (output / "contract-provenance.json").write_text(json.dumps(provenance, indent=2) + "\n", encoding="utf-8")
    (output / "SHA256SUMS").write_text(f"{checksum}  {wheel.name}\n", encoding="utf-8")
    return wheel


def main() -> None:
    parser = argparse.ArgumentParser(description="Build a contract wheel using the app release tag")
    parser.add_argument("--tag", required=True)
    parser.add_argument("--commit", required=True)
    parser.add_argument("--repository", required=True)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    try:
        wheel = build_release(args.tag, args.commit, args.repository, args.output)
    except (ValueError, subprocess.CalledProcessError) as error:
        parser.exit(1, f"{error}\n")
    print(wheel)


if __name__ == "__main__":
    main()
