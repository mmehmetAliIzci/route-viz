"""Rebuild the recommendation and moderate_mi in saved plans from their stored checkpoints.

Offline: no network, no API key. Run from backend/:
uv run python scripts/refresh_explanations.py [path ...]

With no paths it refreshes data/samples/*.json. Each file keeps its own JSON layout.
Refuses to write a file whose recommended route would change.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from planner import samples  # noqa: E402
from planner.samples import refresh  # noqa: E402


def _indent(text: str) -> int | None:
    """The indent of an existing JSON file, or None when it is compact."""
    lines = text.split("\n", 2)
    if len(lines) < 2:
        return None
    return len(lines[1]) - len(lines[1].lstrip()) or None


def refresh_file(path: Path) -> None:
    text = path.read_text()
    indent = _indent(text)
    try:
        body = refresh(json.loads(text))
    except ValueError as err:
        raise SystemExit(f"{path}: {err}") from err
    path.write_text(json.dumps(body, indent=indent) if indent else json.dumps(body, separators=(",", ":")))


def main(argv: list[str] | None = None) -> None:
    args = sys.argv[1:] if argv is None else argv
    paths = [Path(a) for a in args] or sorted(samples.SAMPLES_DIR.glob("*.json"))
    for path in paths:
        refresh_file(path)
        print(f"refreshed {path}")


if __name__ == "__main__":
    main()
