"""Owner alias resolution, status normalization and inference, and free-text
due-date parsing. Plain functions against stated fields, no LLM calls.
"""
import csv
import re
from datetime import date, timedelta

from engine.config import (
    DONE_STATUS_VALUES,
    DONE_TEXT_HINTS,
    OPEN_TEXT_HINTS,
    CLOSED_TRIGGER_PATTERNS,
    PRINCIPAL_PATTERNS,
)

WEEKDAYS = {
    "monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3,
    "friday": 4, "saturday": 5, "sunday": 6,
}


class AliasTable:
    """The offline, human-reviewed alias table (data contract section 5).
    The engine only reads it. It never fuzzy-matches names on its own, so a
    name the table has never seen is reported, not guessed at.
    """

    def __init__(self, path):
        self.by_name_and_unit = {}
        by_name = {}
        with open(path, newline="", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                raw = row["raw_name"].strip()
                unit = row["unit"].strip()
                canonical = row["normalized_owner"].strip()
                self.by_name_and_unit[(raw, unit)] = canonical
                by_name.setdefault(raw, set()).add(canonical)
        # A raw name alone is only usable when every row for it agrees.
        self.by_name = {raw: next(iter(c)) for raw, c in by_name.items() if len(c) == 1}
        self.unresolved = set()   # (raw_name, unit) pairs seen but not in the table

    def resolve(self, raw_name, unit):
        raw_name = (raw_name or "").strip()
        if (raw_name, unit) in self.by_name_and_unit:
            return self.by_name_and_unit[(raw_name, unit)]
        if raw_name in self.by_name:
            return self.by_name[raw_name]
        self.unresolved.add((raw_name, unit))
        return raw_name


def normalize_status(raw_status):
    """Map a unit's status vocabulary onto "open", "done" or
    "pending_decision". Handles Mart's inconsistent values ("done", "Done",
    "complete", blank). Returns None when blank, so the caller can fall back
    to reading the description.
    """
    if raw_status is None:
        return None
    s = str(raw_status).strip().lower()
    if s in ("", "nan"):
        return None
    if s in DONE_STATUS_VALUES:
        return "done"
    if s == "pending decision":
        return "pending_decision"
    return "open"


def infer_status_from_text(description):
    """Wasla Table has no status column, by design. Read status out of the
    description. Done hints win over open hints.
    """
    low = (description or "").lower()
    if any(hint in low for hint in DONE_TEXT_HINTS):
        return "done"
    if any(hint in low for hint in OPEN_TEXT_HINTS):
        return "open"
    return "open"   # untagged stays visible rather than silently vanishing


def is_decision_pending(status, description):
    if status == "done":
        return False
    if status == "pending_decision":
        return True
    low = (description or "").lower()
    return any(p.search(low) for p in CLOSED_TRIGGER_PATTERNS)


def is_blocked_on_principal(description, blocked_by):
    text = f"{description} {blocked_by}".lower()
    return any(p.search(text) for p in PRINCIPAL_PATTERNS)


def parse_due_date(raw_due_date, today):
    """Return (date or None, is_approximate).

    Handles ISO dates, blanks, and Express's free text ("end of this week",
    "next Tuesday", "in 2 weeks"). Free text that can't be read ("TBD",
    "ASAP") returns (None, True): the item has no usable deadline and is
    flagged as needing one, rather than quietly scored as not urgent.
    """
    if raw_due_date is None:
        return None, False
    text = str(raw_due_date).strip()
    if text == "" or text.lower() == "nan":
        return None, False

    try:
        return date.fromisoformat(text), False
    except ValueError:
        pass

    low = text.lower()

    m = re.match(r"^in (\d+) weeks?$", low)
    if m:
        return today + timedelta(weeks=int(m.group(1))), True

    m = re.match(r"^in (\d+) days?$", low)
    if m:
        return today + timedelta(days=int(m.group(1))), True

    if low in ("end of this week", "end of the week", "eow"):
        return today + timedelta(days=(4 - today.weekday()) % 7), True

    if low == "end of next week":
        return today + timedelta(days=(4 - today.weekday()) % 7 + 7), True

    # "next Tuesday" is read as the nearest coming Tuesday. People use it both
    # ways; the page marks every parsed date as approximate and shows the raw
    # text, so the reader can see what the engine assumed.
    m = re.match(r"^next (\w+)$", low)
    if m and m.group(1) in WEEKDAYS:
        days_ahead = (WEEKDAYS[m.group(1)] - today.weekday()) % 7 or 7
        return today + timedelta(days=days_ahead), True

    return None, True
