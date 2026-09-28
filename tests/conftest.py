import csv
import os
import shutil
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest

from engine.briefing import build_briefing
from engine.config import DEFAULT_TODAY
from engine.history import build_history

DATA_ROOT = os.path.join(os.path.dirname(__file__), "..", "data")
WEEKS_DIR = os.path.join(DATA_ROOT, "weeks")
ALIAS_PATH = os.path.join(DATA_ROOT, "alias_table.csv")
WEEK_1 = os.path.join(WEEKS_DIR, "2026-09-27")


@pytest.fixture(scope="session")
def briefing():
    """Week 1 on its own, the original single-week snapshot."""
    return build_briefing(WEEK_1, today=DEFAULT_TODAY, alias_path=ALIAS_PATH)


@pytest.fixture(scope="session")
def history():
    """All four weeks, oldest first, keyed by week_ending string."""
    return {b.week_ending.isoformat(): b for b in build_history(WEEKS_DIR, alias_path=ALIAS_PATH)}


@pytest.fixture
def data_copy(tmp_path):
    """A throwaway copy of week 1 (plus the alias table) for tests that
    change one field. Returns the week folder."""
    shutil.copy(ALIAS_PATH, tmp_path / "alias_table.csv")
    dst = tmp_path / "weeks" / "2026-09-27"
    shutil.copytree(WEEK_1, dst)
    return dst


@pytest.fixture
def full_copy(tmp_path):
    """A throwaway copy of all of data/. Returns the data folder."""
    dst = tmp_path / "data"
    shutil.copytree(DATA_ROOT, dst)
    return dst


def edit_csv(path, match, updates):
    """Set `updates` on every row where all `match` fields are equal."""
    with open(path, newline="") as f:
        reader = csv.DictReader(f)
        fields, rows = reader.fieldnames, list(reader)
    for row in rows:
        if all(row[k] == v for k, v in match.items()):
            row.update(updates)
    with open(path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def find_commitment(briefing, owner=None, description_contains=None, unit=None):
    matches = [
        c for c in briefing.all_commitments
        if (owner is None or c.owner == owner)
        and (unit is None or c.unit == unit)
        and (description_contains is None or description_contains.lower() in c.description.lower())
    ]
    assert len(matches) == 1, (
        f"expected 1 match for owner={owner!r} unit={unit!r} "
        f"description_contains={description_contains!r}, got {len(matches)}"
    )
    return matches[0]
