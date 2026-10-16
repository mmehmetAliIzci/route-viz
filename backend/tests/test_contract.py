"""The plan JSON the frontend parses. Refresh: UPDATE_CONTRACT=1 uv run pytest tests/test_contract.py."""

import json
import os
from pathlib import Path

from tests.recorded import build_kc_den

CONTRACT = Path(__file__).resolve().parents[2] / "frontend" / "src" / "test" / "plan-contract.json"


def test_plan_matches_the_frontend_contract() -> None:
    # The body as the browser receives it: through JSON, so tuples and floats match the file.
    body = json.loads(json.dumps(build_kc_den("America/Denver")))
    if os.environ.get("UPDATE_CONTRACT") == "1":
        CONTRACT.write_text(json.dumps(body, indent=2) + "\n")
    assert body == json.loads(CONTRACT.read_text()), "run with UPDATE_CONTRACT=1 and review the diff"
