#!/usr/bin/env python3
"""Build and optionally publish Python packages with minimal CI coupling."""

from __future__ import annotations

import argparse
import json
import os
import shlex
import shutil
import subprocess
import sys
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build Python packages and optionally upload them to a package registry."
    )
    parser.add_argument(
        "--config",
        default="scripts/python-publish.json",
        help="Path to python-publish.json configuration file. Defaults to scripts/python-publish.json.",
    )
    parser.add_argument(
        "--package-dir",
        help="(Legacy) Path to a single package directory. Overrides --config.",
    )
    parser.add_argument(
        "--repository-url",
        default=os.getenv("PACKAGE_REPOSITORY_URL"),
        help="Package repository upload URL. Defaults to PACKAGE_REPOSITORY_URL.",
    )
    parser.add_argument(
        "--username",
        default=os.getenv("PACKAGE_REPOSITORY_USERNAME"),
        help="Package repository username. Defaults to PACKAGE_REPOSITORY_USERNAME.",
    )
    parser.add_argument(
        "--password",
        default=os.getenv("PACKAGE_REPOSITORY_PASSWORD"),
        help="Package repository password or token. Defaults to PACKAGE_REPOSITORY_PASSWORD.",
    )
    parser.add_argument(
        "--skip-upload",
        action="store_true",
        help="Build artifacts only and skip the upload step.",
    )
    parser.add_argument(
        "--keep-dist",
        action="store_true",
        help="Keep existing dist artifacts instead of cleaning them before build.",
    )
    parser.add_argument(
        "--skip-existing",
        action="store_true",
        help="Pass --skip-existing to twine upload.",
    )
    return parser.parse_args()


def run(cmd: list[str], *, cwd: Path, env: dict[str, str] | None = None) -> None:
    print(f"+ {shlex.join(cmd)}")
    subprocess.run(cmd, cwd=cwd, env=env, check=True)


def validate_package_dir(package_dir: Path) -> None:
    pyproject = package_dir / "pyproject.toml"
    if not pyproject.is_file():
        raise SystemExit(f"pyproject.toml not found in package directory: {package_dir}")


def clean_dist(package_dir: Path) -> None:
    dist_dir = package_dir / "dist"
    if dist_dir.exists():
        shutil.rmtree(dist_dir)


def collect_artifacts(package_dir: Path) -> list[Path]:
    dist_dir = package_dir / "dist"
    artifacts = sorted(dist_dir.glob("*"))
    files = [
        artifact
        for artifact in artifacts
        if artifact.is_file() and artifact.suffix in {".whl", ".gz", ".zip"}
    ]
    if not files:
        raise SystemExit(f"No build artifacts found in {dist_dir}")
    return files


def load_packages_config(config_path: Path) -> list[dict]:
    """Load package configuration from JSON file."""
    with config_path.open("r", encoding="utf-8") as f:
        config = json.load(f)
    packages = config.get("packages", [])
    return [pkg for pkg in packages if pkg.get("publish", True)]


def main() -> int:
    args = parse_args()
    repo_root = Path(__file__).resolve().parents[1]

    # Determine which packages to publish
    if args.package_dir:
        # Legacy: single package mode
        packages = [{"path": args.package_dir}]
    else:
        # Config mode: read from packages.json
        config_path = repo_root / args.config
        if not config_path.is_file():
            raise SystemExit(f"Config file not found: {config_path}")
        packages = load_packages_config(config_path)
        if not packages:
            raise SystemExit("No packages to publish in config.")

    all_artifacts: list[Path] = []

    # Build all packages
    for pkg in packages:
        package_dir = (repo_root / pkg["path"]).resolve()
        validate_package_dir(package_dir)

        if not args.keep_dist:
            clean_dist(package_dir)

        run(["uv", "build"], cwd=package_dir)
        artifacts = collect_artifacts(package_dir)

        print(f"Built artifacts for {pkg['path']}:")
        for artifact in artifacts:
            print(f"- {artifact.relative_to(repo_root)}")
        all_artifacts.extend(artifacts)

    if args.skip_upload:
        return 0

    if not all_artifacts:
        raise SystemExit("No artifacts to upload.")

    if not args.repository_url:
        raise SystemExit("Missing repository URL. Set --repository-url or PACKAGE_REPOSITORY_URL.")
    if not args.username:
        raise SystemExit("Missing repository username. Set --username or PACKAGE_REPOSITORY_USERNAME.")
    if not args.password:
        raise SystemExit("Missing repository password. Set --password or PACKAGE_REPOSITORY_PASSWORD.")

    upload_cmd = [
        "uv",
        "run",
        "--with",
        "twine",
        "twine",
        "upload",
        "--non-interactive",
        "--repository-url",
        args.repository_url,
    ]
    if args.skip_existing:
        upload_cmd.append("--skip-existing")
    upload_cmd.extend(str(artifact) for artifact in all_artifacts)

    upload_env = os.environ.copy()
    upload_env["TWINE_USERNAME"] = args.username
    upload_env["TWINE_PASSWORD"] = args.password

    run(upload_cmd, cwd=repo_root, env=upload_env)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except subprocess.CalledProcessError as exc:
        print(f"Command failed with exit code {exc.returncode}", file=sys.stderr)
        raise SystemExit(exc.returncode) from exc
