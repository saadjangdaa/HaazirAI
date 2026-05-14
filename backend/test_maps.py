"""Run maps unit tests: from this folder run ``py -m test_maps`` (same as pytest on tests/test_maps.py)."""
import subprocess
import sys
from pathlib import Path


def main() -> int:
    root = Path(__file__).resolve().parent
    target = root / "tests" / "test_maps.py"
    return subprocess.call(
        [sys.executable, "-m", "pytest", str(target), "-v"],
        cwd=str(root),
    )


if __name__ == "__main__":
    raise SystemExit(main())
