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

# Emotional decay progress and rendering. This used to live in the app's
# src/decay.js, and now runs in the "Reflective Modules" service.

import html as html_lib
import re
import time
from typing import Optional

DAY_MS = 86400000

# Matches a whole run of spaces, tabs or newlines.
SPACE_RE = re.compile(r"\s+")

# Matches an HTML tag, e.g. <p> or </strong>.
TAG_RE = re.compile(r"<[^>]+>")


def get_decay_progress(created_at: int, decay: Optional[dict]) -> dict:
    """Work out how far along an entry is, from 0 (new) to 1 (fully decayed)."""
    if not decay:
        return {"progress": 0, "fullyDecayed": False}

    now_ms = time.time() * 1000
    elapsed = now_ms - created_at
    total = decay["durationDays"] * DAY_MS

    if total > 0:
        progress = elapsed / total
        if progress > 1.0:
            progress = 1.0
    else:
        # A duration of zero days means it is already gone.
        progress = 1.0

    return {"progress": progress, "fullyDecayed": progress >= 1}


def esc_html(text: str) -> str:
    """Make text safe to put inside HTML."""
    text = text.replace("&", "&amp;")
    text = text.replace("<", "&lt;")
    text = text.replace(">", "&gt;")
    return text


def html_to_text(markup: str) -> str:
    """Strip the tags out of rich HTML so only the words are left.

    There is no browser here, so this uses a regex instead of reading the text
    the way a page would. It is close enough for redacting words, but it is not
    an exact match for unusual markup (a <br> does not turn into a space).
    """
    text = TAG_RE.sub("", markup)
    return html_lib.unescape(text)


def is_space(piece: str) -> bool:
    """True if this piece is only whitespace."""
    if not piece:
        return False
    return SPACE_RE.fullmatch(piece) is not None


def render_decay_body(created_at: int, decay: dict, body: Optional[str], rich: bool) -> dict:
    """Build the HTML for a decaying entry at its current stage."""
    status = get_decay_progress(created_at, decay)
    progress = status["progress"]

    # Once it is fully decayed there is no body left, only the tombstone.
    if status["fullyDecayed"]:
        tombstone = decay.get("tombstone")
        if not tombstone:
            tombstone = None
        return {
            "html": "",
            "tombstone": tombstone,
            "fullyDecayed": True,
            "progress": progress,
        }

    raw_body = body or ""
    mode = decay.get("mode", "words")

    # "burn" mode keeps every word but fades the whole thing out.
    if mode == "burn":
        opacity = 1 - progress * 0.85
        if rich:
            inner = raw_body
        else:
            inner = esc_html(raw_body)
        return {
            "html": '<span style="opacity:%.3f">%s</span>' % (opacity, inner),
            "tombstone": None,
            "fullyDecayed": False,
            "progress": progress,
        }

    if rich:
        plain_body = html_to_text(raw_body)
    else:
        plain_body = raw_body

    # "words" mode blanks out words from the end, working backwards.
    if mode == "words":
        return render_words_mode(plain_body, progress)

    return {
        "html": esc_html(plain_body),
        "tombstone": None,
        "fullyDecayed": False,
        "progress": progress,
    }


def render_words_mode(plain_body: str, progress: float) -> dict:
    """Replace the last words with blocks, in step with how far decay has got."""
    # Splitting on a capturing group keeps the spaces, so the text can be put
    # back together exactly as it was.
    pieces = re.split(r"(\s+)", plain_body)

    # Count the real words, ignoring the spacing between them.
    word_count = 0
    for piece in pieces:
        if not is_space(piece):
            word_count += 1

    # Everything from this word onwards gets blanked out.
    redact_count = int(progress * word_count)
    redact_from = word_count - redact_count

    out = []
    word_index = 0

    for piece in pieces:
        if is_space(piece):
            out.append(piece)
            continue

        if word_index >= redact_from:
            blocks = "█" * len(piece)
            out.append('<span class="decay-redacted">%s</span>' % blocks)
        else:
            out.append(esc_html(piece))

        word_index += 1

    return {
        "html": "".join(out),
        "tombstone": None,
        "fullyDecayed": False,
        "progress": progress,
    }
