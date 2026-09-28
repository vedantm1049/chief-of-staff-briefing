"""Per-unit loaders. Each unit ships its weekly inputs in a different shape
(data contract section 3). This module absorbs that into one common record.
It reads and normalizes. It scores nothing.
"""
import csv
import math
import os
from dataclasses import dataclass
from datetime import date
from typing import Optional

import pandas as pd

from engine.config import UNIT_DISPLAY_NAMES, CUSTOMER_METRIC_COLUMNS
from engine.normalize import (
    normalize_status,
    infer_status_from_text,
    is_decision_pending,
    is_blocked_on_principal,
    parse_due_date,
)


@dataclass
class Commitment:
    unit: str                    # unit whose file lists the item, e.g. "Wasla Table"
    raw_owner: str
    owner: str                   # after alias resolution
    description: str
    due_date_raw: str
    due_date: Optional[date]
    due_date_approx: bool        # parsed from free text
    status_raw: Optional[str]
    status: str                  # "open" | "done" | "pending_decision"
    status_inferred: bool        # read from the description, not a status column
    last_updated: Optional[date]
    blocked_by: str
    decision_type: str
    regulatory_deadline: Optional[bool]
    decision_pending: bool
    principal_blocked: bool


@dataclass
class UnitData:
    key: str
    name: str
    kpi: dict                    # this week's KPI row (empty for Mart, see kpi_breakdown)
    kpi_breakdown: Optional[dict]   # Mart only: {tab name: row}
    status_update: str           # loaded for reference, never scored
    commitments: list
    customer_metric: Optional[dict] = None


def _clean(v):
    """Blank strings and NaN become None."""
    if v is None:
        return None
    if isinstance(v, float) and math.isnan(v):
        return None
    if isinstance(v, str) and v.strip() in ("", "nan"):
        return None
    return v


def _to_float(v):
    v = _clean(v)
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _to_bool(v):
    v = _clean(v)
    if v is None:
        return None
    return str(v).strip().lower() in ("true", "1", "yes")


def _to_date(v):
    v = _clean(v)
    if v is None:
        return None
    try:
        return date.fromisoformat(str(v).strip())
    except ValueError:
        return None


def _read_csv_rows(path):
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def _load_commitments(path, unit_name, aliases, today, has_status_column):
    out = []
    for row in _read_csv_rows(path):
        description = (row.get("description") or "").strip()

        status_raw = row.get("status") if has_status_column else None
        status = normalize_status(status_raw)
        status_inferred = status is None
        if status is None:
            status = infer_status_from_text(description)

        due_raw = (row.get("due_date") or "").strip()
        due_date, approx = parse_due_date(due_raw, today)
        blocked_by = (row.get("blocked_by") or "").strip()
        decision_pending = is_decision_pending(status, description)

        out.append(Commitment(
            unit=unit_name,
            raw_owner=(row.get("owner") or "").strip(),
            owner=aliases.resolve(row.get("owner"), unit_name),
            description=description,
            due_date_raw=due_raw,
            due_date=due_date,
            due_date_approx=approx,
            status_raw=status_raw,
            status=status,
            status_inferred=status_inferred,
            last_updated=_to_date(row.get("last_updated")),
            blocked_by=blocked_by,
            decision_type=(row.get("decision_type") or "").strip(),
            regulatory_deadline=_to_bool(row.get("regulatory_deadline")),
            decision_pending=decision_pending,
            principal_blocked=decision_pending and is_blocked_on_principal(description, blocked_by),
        ))
    return out


def _load_kpi_csv(path):
    rows = _read_csv_rows(path)
    if not rows:
        return {}
    out = {}
    for k, v in rows[0].items():
        num = _to_float(v)
        out[k] = num if num is not None else _clean(v)
    return out


def _customer_metric(unit):
    """Rating vs target for customer-facing units. Mart's three city tabs are
    blended, weighted by each tab's rated-order count. Central has none.
    """
    cols = CUSTOMER_METRIC_COLUMNS.get(unit.name)
    if cols is None:
        return None
    rating_col, target_col, count_col = cols

    if unit.kpi_breakdown is None:
        return {
            "rating": _to_float(unit.kpi.get(rating_col)),
            "target": _to_float(unit.kpi.get(target_col)),
            "count": _to_float(unit.kpi.get(count_col)),
            "per_tab": None,
        }

    total = rating_sum = target_sum = 0.0
    per_tab = {}
    for tab, row in unit.kpi_breakdown.items():
        rating = _to_float(row.get(rating_col))
        target = _to_float(row.get(target_col))
        count = _to_float(row.get(count_col))
        per_tab[tab] = {"rating": rating, "target": target, "count": count}
        if rating is None or target is None or not count:
            continue
        total += count
        rating_sum += rating * count
        target_sum += target * count
    return {
        "rating": rating_sum / total if total else None,
        "target": target_sum / total if total else None,
        "count": total if total else None,
        "per_tab": per_tab,
    }


def load_unit(unit_key, data_dir, aliases, today):
    name = UNIT_DISPLAY_NAMES[unit_key]
    unit_dir = os.path.join(data_dir, unit_key)

    with open(os.path.join(unit_dir, "status_update.txt"), encoding="utf-8") as f:
        status_update = f.read().strip()

    xlsx = os.path.join(unit_dir, "kpi_export.xlsx")
    if os.path.exists(xlsx):
        sheets = pd.read_excel(xlsx, sheet_name=None)
        kpi, breakdown = {}, {tab: df.iloc[0].to_dict() for tab, df in sheets.items()}
    else:
        kpi, breakdown = _load_kpi_csv(os.path.join(unit_dir, "kpi_export.csv")), None

    commitments_path = os.path.join(unit_dir, "commitments.csv")
    with open(commitments_path, newline="", encoding="utf-8") as f:
        has_status_column = "status" in (csv.DictReader(f).fieldnames or [])

    unit = UnitData(
        key=unit_key,
        name=name,
        kpi=kpi,
        kpi_breakdown=breakdown,
        status_update=status_update,
        commitments=_load_commitments(commitments_path, name, aliases, today, has_status_column),
    )
    unit.customer_metric = _customer_metric(unit)
    return unit


def load_all_units(data_dir, aliases, today):
    return {key: load_unit(key, data_dir, aliases, today) for key in UNIT_DISPLAY_NAMES}


def detect_week_ending(units):
    """Most common week_ending across the KPI exports that carry one."""
    seen = [str(u.kpi["week_ending"]) for u in units.values() if u.kpi.get("week_ending")]
    return max(set(seen), key=seen.count) if seen else None
