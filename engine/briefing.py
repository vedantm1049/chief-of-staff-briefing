"""Wires load, normalize, detect and classify into one BriefingModel for a
single week. engine/history.py compares several of these week to week.
"""
import os
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Optional

from engine.config import DEFAULT_TODAY
from engine.normalize import AliasTable
from engine.loaders import load_all_units, detect_week_ending
from engine.rules import (
    all_commitments,
    is_stale,
    is_overdue,
    needs_deadline_set,
    find_conflicts,
    blocked_items,
    evaluate_customer_health,
)
from engine.classify import classify_commitment, sort_quadrant, QUADRANT_ORDER


@dataclass
class BriefingModel:
    today: object
    week_ending: object
    units: dict
    all_commitments: list
    conflicts: list
    conflict_partner_map: dict   # id(commitment) -> [partner commitments]
    stale_ids: set
    overdue_ids: set
    blocks_map: dict             # id(commitment) -> [open items it blocks]
    needs_deadline_items: list
    classified: dict             # id(commitment) -> ClassifiedItem
    quadrants: dict              # quadrant name -> [ClassifiedItem], sorted
    customer_health: list
    unresolved_owners: list      # [(raw_name, unit)] not in the alias table
    comparison: Optional[object] = None   # set by engine/history.py
    week_links: list = field(default_factory=list)


def flagged_commitments(b):
    """Everything this week's briefing surfaces: graded items plus the ones
    that need a deadline."""
    return [i.commitment for i in b.classified.values()] + list(b.needs_deadline_items)


def build_briefing(data_dir, today=None, alias_path=None):
    """Score one week. data_dir holds the six unit folders. alias_path defaults
    to data_dir/alias_table.csv, else the shared table one level up."""
    if alias_path is None:
        alias_path = os.path.join(data_dir, "alias_table.csv")
        if not os.path.exists(alias_path):
            alias_path = os.path.join(data_dir, "..", "..", "alias_table.csv")
    aliases = AliasTable(alias_path)

    if today is None:
        folder = os.path.basename(os.path.normpath(data_dir))
        try:
            today = date.fromisoformat(folder) + timedelta(days=1)   # the Monday after
        except ValueError:
            today = DEFAULT_TODAY

    units = load_all_units(data_dir, aliases, today)
    commitments = all_commitments(units)

    stale_ids = {id(c) for c in commitments if is_stale(c, today, commitments)}
    overdue_ids = {id(c) for c in commitments if is_overdue(c, today, commitments)}
    blocks_map = {id(c): blocked_items(c, commitments) for c in commitments}

    conflicts = find_conflicts(commitments)
    partners = {}
    for pair in conflicts:
        partners.setdefault(id(pair.a), []).append(pair.b)
        partners.setdefault(id(pair.b), []).append(pair.a)

    needs_deadline_items = [c for c in commitments if needs_deadline_set(c)]
    needs_deadline_ids = {id(c) for c in needs_deadline_items}

    customer_health = evaluate_customer_health(units)
    rating_missed = {r.unit_name for r in customer_health if r.triggered}

    classified = {}
    quadrants = {q: [] for q in QUADRANT_ORDER}
    for c in commitments:
        flags = []
        if c.decision_pending:
            flags.append("decision-pending")
        if id(c) in overdue_ids:
            flags.append("overdue")
        if id(c) in stale_ids:
            flags.append("stale")
        if id(c) in partners:
            flags.append("conflict")
        if not flags or id(c) in needs_deadline_ids:
            continue
        item = classify_commitment(c, today, blocks_map[id(c)], rating_missed)
        item.flags = flags
        item.conflict_partners = partners.get(id(c), [])
        classified[id(c)] = item
        quadrants[item.quadrant].append(item)

    quadrants = {q: sort_quadrant(q, items, today) for q, items in quadrants.items()}

    folder = os.path.basename(os.path.normpath(data_dir))
    try:
        week_ending = date.fromisoformat(folder)
    except ValueError:
        week_ending = detect_week_ending(units)

    return BriefingModel(
        today=today,
        week_ending=week_ending,
        units=units,
        all_commitments=commitments,
        conflicts=conflicts,
        conflict_partner_map=partners,
        stale_ids=stale_ids,
        overdue_ids=overdue_ids,
        blocks_map=blocks_map,
        needs_deadline_items=needs_deadline_items,
        classified=classified,
        quadrants=quadrants,
        customer_health=customer_health,
        unresolved_owners=sorted(aliases.unresolved),
    )
