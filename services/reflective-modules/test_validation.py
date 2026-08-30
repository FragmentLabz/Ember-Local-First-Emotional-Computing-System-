# ember - a local-first encrypted journaling app.
# Copyright (C) 2026 Jeremiah Ayeni <https://github.com/Jeremy-1011>
#
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# This program is free software: you can redistribute it and/or modify it
# under the terms of the GNU Affero General Public License as published by
# the Free Software Foundation, either version 3 of the License, or (at your
# option) any later version.
#
# This program is distributed in the hope that it will be useful, but
# WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero
# General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with this program. If not, see <https://www.gnu.org/licenses/>.

# These mirror services/validation-engine-tests/ValidationEngineTests.cs case
# for case. If a rule changes, both files should change together.

import time

from fastapi.testclient import TestClient

from app import app
from validation import can_modify, validate_entry

client = TestClient(app)

DAY_MS = 86400000
NOW = int(time.time() * 1000)


# --- validate_entry --------------------------------------------------------

def test_rejects_past_capsule_unlock_date():
    result = validate_entry("capsule", {"unlockAt": NOW - DAY_MS}, None)
    assert result["valid"] is False


def test_accepts_future_capsule_unlock_date():
    result = validate_entry("capsule", {"unlockAt": NOW + DAY_MS}, None)
    assert result["valid"] is True


def test_capsule_without_settings_is_rejected():
    result = validate_entry("capsule", None, None)
    assert result["valid"] is False


def test_decay_bounds():
    # (durationDays, mode, expected valid) -- same table as the C# theory test.
    cases = [
        (0, "words", False),
        (3651, "words", False),
        (30, "sizzle", False),
        (30, "words", True),
        (1, "burn", True),
    ]
    for duration_days, mode, expected in cases:
        result = validate_entry("decay", None, {"durationDays": duration_days, "mode": mode})
        assert result["valid"] is expected


def test_regular_entry_is_valid():
    assert validate_entry("regular", None, None)["valid"] is True


def test_unknown_type_is_rejected():
    result = validate_entry("nonsense", None, None)
    assert result["valid"] is False
    assert "nonsense" in result["errors"][0]


# --- can_modify ------------------------------------------------------------

def test_locks_until_first_revisit():
    assert can_modify("regular", False, None) is False


def test_unlocks_regular_entry_after_revisit():
    assert can_modify("regular", True, None) is True


def test_keeps_sealed_capsule_locked_before_unlock_date():
    assert can_modify("capsule", True, NOW + DAY_MS) is False


def test_unlocks_capsule_after_unlock_date():
    assert can_modify("capsule", True, NOW - DAY_MS) is True


# --- Over HTTP, at both the root and the /api prefix -----------------------

def test_health_on_both_paths():
    assert client.get("/health").json() == {"status": "ok"}
    assert client.get("/api/health").json() == {"status": "ok"}


def test_validate_entry_endpoint_on_both_paths():
    payload = {"type": "capsule", "capsule": {"unlockAt": NOW - DAY_MS}}
    for path in ["/validate/entry", "/api/validate/entry"]:
        res = client.post(path, json=payload)
        assert res.status_code == 200
        assert res.json()["valid"] is False


def test_can_modify_endpoint_on_both_paths():
    payload = {"type": "regular", "priorRevisit": True}
    for path in ["/validate/can-modify", "/api/validate/can-modify"]:
        res = client.post(path, json=payload)
        assert res.status_code == 200
        assert res.json()["allowed"] is True


def test_decay_endpoints_still_work_on_api_prefix():
    res = client.post(
        "/api/reflect/decay/batch",
        json={"entries": [{"id": "a", "createdAt": 1000, "decay": {"durationDays": 30}}]},
    )
    assert res.status_code == 200
    assert res.json()["results"]["a"]["fullyDecayed"] is True
