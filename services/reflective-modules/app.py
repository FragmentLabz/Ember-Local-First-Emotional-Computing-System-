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

# Ember's "Reflective Modules" service. It works out how far entries have
# decayed. It is bound to 127.0.0.1 only, so nothing here is reachable from
# outside this machine.

from typing import List, Optional

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from decay import get_decay_progress, render_decay_body

HOST = "127.0.0.1"
PORT = 8902

app = FastAPI()

# The Vite dev server, plus Electron's file:// pages, which send "null".
ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "null",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Request shapes --------------------------------------------------------
# FastAPI uses these classes to check incoming JSON before it reaches us.

class DecayConfig(BaseModel):
    durationDays: int
    mode: Optional[str] = "words"
    tombstone: Optional[str] = None


class BatchEntry(BaseModel):
    id: str
    createdAt: int
    decay: DecayConfig


class BatchRequest(BaseModel):
    entries: List[BatchEntry]


class RenderRequest(BaseModel):
    createdAt: int
    decay: DecayConfig
    body: Optional[str] = ""
    rich: Optional[bool] = False


# --- Routes ----------------------------------------------------------------

@app.get("/health")
def health():
    """Used by the app at startup to check this service is running."""
    return {"status": "ok"}


@app.post("/reflect/decay/batch")
def decay_batch(req: BatchRequest):
    """Work out the decay progress for a whole list of entries at once."""
    results = {}
    for entry in req.entries:
        decay_settings = entry.decay.model_dump()
        results[entry.id] = get_decay_progress(entry.createdAt, decay_settings)
    return {"results": results}


@app.post("/reflect/decay/render")
def decay_render(req: RenderRequest):
    """Build the partly decayed HTML for one entry."""
    decay_settings = req.decay.model_dump()
    is_rich = bool(req.rich)
    return render_decay_body(req.createdAt, decay_settings, req.body, is_rich)


if __name__ == "__main__":
    uvicorn.run(app, host=HOST, port=PORT)
