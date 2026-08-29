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

# Emotional decay progress & rendering — a port of the app's former
# src/decay.js, now living in the "Reflective Modules" service.

import re
import time
import html as html_lib

DAY_MS = 86400000


def get_decay_progress(created_at: int, decay: dict | None) -> dict:
    if not decay:
        return {"progress": 0, "fullyDecayed": False}
    elapsed = time.time() * 1000 - created_at
    total = decay["durationDays"] * DAY_MS
    progress = min(1.0, elapsed / total) if total > 0 else 1.0
    return {"progress": progress, "fullyDecayed": progress >= 1}


def esc_html(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def html_to_text(markup: str) -> str:
    # No DOM available server-side, so rich bodies are flattened with a
    # regex tag-strip + entity-unescape rather than a real textContent walk.
    # Close enough for redaction purposes; not a byte-for-byte match for
    # unusual markup (e.g. <br> does not become a space).
    text = re.sub(r"<[^>]+>", "", markup)
    return html_lib.unescape(text)


def render_decay_body(created_at: int, decay: dict, body: str | None, rich: bool) -> dict:
    status = get_decay_progress(created_at, decay)
    progress, fully_decayed = status["progress"], status["fullyDecayed"]

    if fully_decayed:
        return {
            "html": "",
            "tombstone": decay.get("tombstone") or None,
            "fullyDecayed": True,
            "progress": progress,
        }

    raw_body = body or ""
    mode = decay.get("mode", "words")

    if mode == "burn":
        opacity = 1 - progress * 0.85
        inner = raw_body if rich else esc_html(raw_body)
        return {
            "html": f'<span style="opacity:{opacity:.3f}">{inner}</span>',
            "tombstone": None,
            "fullyDecayed": False,
            "progress": progress,
        }

    plain_body = html_to_text(raw_body) if rich else raw_body

    if mode == "words":
        words = re.split(r"(\s+)", plain_body)
        non_space = [w for w in words if not re.fullmatch(r"\s+", w or "")]
        redact_count = int(progress * len(non_space))
        redact_from = len(non_space) - redact_count
        to_redact = set(range(redact_from, len(non_space)))

        out = []
        ns_idx = 0
        for w in words:
            if re.fullmatch(r"\s+", w or ""):
                out.append(w)
                continue
            i = ns_idx
            ns_idx += 1
            if i in to_redact:
                out.append(f'<span class="decay-redacted">{"█" * len(w)}</span>')
            else:
                out.append(esc_html(w))
        return {
            "html": "".join(out),
            "tombstone": None,
            "fullyDecayed": False,
            "progress": progress,
        }

    return {
        "html": esc_html(plain_body),
        "tombstone": None,
        "fullyDecayed": False,
        "progress": progress,
    }
