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

# Ember's "Reflective Modules" — non-interpretive decay processing, kept
# local-only (bound to 127.0.0.1, no external network).

from typing import Optional

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from decay import get_decay_progress, render_decay_body

app = FastAPI()

# Vite dev server + Electron's file:// pages (which send Origin: null).
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "null"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class DecayConfig(BaseModel):
    durationDays: int
    mode: Optional[str] = "words"
    tombstone: Optional[str] = None


class BatchEntry(BaseModel):
    id: str
    createdAt: int
    decay: DecayConfig


class BatchRequest(BaseModel):
    entries: list[BatchEntry]


class RenderRequest(BaseModel):
    createdAt: int
    decay: DecayConfig
    body: Optional[str] = ""
    rich: Optional[bool] = False


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/reflect/decay/batch")
def decay_batch(req: BatchRequest):
    results = {
        entry.id: get_decay_progress(entry.createdAt, entry.decay.model_dump())
        for entry in req.entries
    }
    return {"results": results}


@app.post("/reflect/decay/render")
def decay_render(req: RenderRequest):
    return render_decay_body(req.createdAt, req.decay.model_dump(), req.body, bool(req.rich))


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8902)
