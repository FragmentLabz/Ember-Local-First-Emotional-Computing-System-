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

import time

from fastapi.testclient import TestClient

from app import app
from decay import get_decay_progress, render_decay_body

client = TestClient(app)

NOW = int(time.time() * 1000)
LONG_AGO = 1000


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


def test_get_decay_progress_not_started():
    result = get_decay_progress(NOW, {"durationDays": 30})
    assert result["fullyDecayed"] is False
    assert 0 <= result["progress"] < 0.01


def test_get_decay_progress_fully_decayed():
    result = get_decay_progress(LONG_AGO, {"durationDays": 30})
    assert result["fullyDecayed"] is True
    assert result["progress"] == 1


def test_render_decay_body_fully_decayed_returns_tombstone():
    result = render_decay_body(
        LONG_AGO, {"durationDays": 30, "tombstone": "gone now"}, "some body", False
    )
    assert result["fullyDecayed"] is True
    assert result["html"] == ""
    assert result["tombstone"] == "gone now"


def test_render_decay_body_words_mode_redacts_from_the_end():
    result = render_decay_body(
        NOW - 15 * 86400000,  # halfway through a 30-day decay
        {"durationDays": 30, "mode": "words"},
        "one two three four",
        False,
    )
    assert "one" in result["html"]
    assert "decay-redacted" in result["html"]
    assert result["fullyDecayed"] is False


def test_render_decay_body_burn_mode_fades_opacity():
    result = render_decay_body(
        NOW - 15 * 86400000,
        {"durationDays": 30, "mode": "burn"},
        "burning",
        False,
    )
    assert "opacity:" in result["html"]
    assert "burning" in result["html"]


def test_render_decay_body_escapes_html_in_plain_entries():
    result = render_decay_body(
        NOW, {"durationDays": 30, "mode": "words"}, "<b>hi</b>", False
    )
    assert "<b>" not in result["html"]
    assert "&lt;b&gt;" in result["html"]


def test_decay_batch_endpoint():
    res = client.post(
        "/reflect/decay/batch",
        json={"entries": [{"id": "a", "createdAt": LONG_AGO, "decay": {"durationDays": 30}}]},
    )
    assert res.status_code == 200
    assert res.json()["results"]["a"]["fullyDecayed"] is True


def test_decay_render_endpoint():
    res = client.post(
        "/reflect/decay/render",
        json={
            "createdAt": NOW,
            "decay": {"durationDays": 30, "mode": "words"},
            "body": "hello there",
            "rich": False,
        },
    )
    assert res.status_code == 200
    assert res.json()["fullyDecayed"] is False
