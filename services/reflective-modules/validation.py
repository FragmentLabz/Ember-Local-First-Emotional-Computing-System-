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

# Entry validation and the time-lock gate.
#
# IMPORTANT: this is a port of services/validation-engine/Program.cs. The C#
# engine is still the one used when Ember runs locally. This Python copy exists
# so a hosted deployment (which cannot run .NET) has the same rules available.
# If you change a rule in one, change it in the other, and update both test
# files: test_validation.py here and ValidationEngineTests.cs there.

import time
from typing import Optional

MIN_DECAY_DAYS = 1
MAX_DECAY_DAYS = 3650
DECAY_MODES = ["words", "burn"]


def now_ms() -> int:
    """The current time in milliseconds, matching JavaScript's Date.now()."""
    return int(time.time() * 1000)


def validate_entry(entry_type: str, capsule: Optional[dict], decay: Optional[dict]) -> dict:
    """Check an entry's settings before it is saved.

    Returns {"valid": bool, "errors": list of strings}.
    """
    errors = []
    now = now_ms()

    if entry_type == "capsule":
        if capsule is None:
            errors.append("A time capsule needs an unlock date.")
        elif capsule["unlockAt"] <= now:
            errors.append("The unlock date must be in the future.")

    elif entry_type == "decay":
        if decay is None:
            errors.append("A decaying entry needs decay settings.")
        else:
            # Default to 0 when missing, so it fails the range check like the C# does.
            days = decay.get("durationDays", 0)
            if days < MIN_DECAY_DAYS or days > MAX_DECAY_DAYS:
                errors.append("Decay duration must be between 1 and 3650 days.")

            if decay.get("mode") not in DECAY_MODES:
                errors.append("Decay mode must be 'words' or 'burn'.")

    elif entry_type != "regular":
        errors.append("Unknown entry type '%s'." % entry_type)

    return {"valid": len(errors) == 0, "errors": errors}


def can_modify(entry_type: str, prior_revisit: bool, capsule_unlock_at: Optional[int]) -> bool:
    """Decide whether an entry may be edited or deleted right now.

    Time-Lock Revisitation: an entry only unlocks on a separate, later visit,
    so it cannot be written and instantly erased. A sealed capsule stays locked
    until its unlock date has passed as well.
    """
    if not prior_revisit:
        return False

    if entry_type == "capsule":
        if capsule_unlock_at is None:
            return False
        return now_ms() >= capsule_unlock_at

    return True
