#!/usr/bin/env python3
"""Build the weekly Wasla Group briefings, one static HTML page per week.

    python main.py                       # every week under data/weeks/
    python main.py --data path/to/data --out path/to/output

Writes output/week-<week_ending>.html for each week and output/index.html,
a copy of the latest week. Each week is scored as of the Monday after it.
"""
import argparse
import glob
import os

from engine.classify import QUADRANT_NEEDS_DECISION_NOW
from engine.history import build_history
from engine.render import render

ROOT = os.path.dirname(os.path.abspath(__file__))


def main():
    parser = argparse.ArgumentParser(description="Build the Wasla Group weekly briefings.")
    parser.add_argument("--data", default=os.path.join(ROOT, "data"),
                        help="folder holding weeks/ and alias_table.csv")
    parser.add_argument("--out", default=os.path.join(ROOT, "output"), help="folder for the HTML pages")
    args = parser.parse_args()

    briefings = build_history(os.path.join(args.data, "weeks"),
                              alias_path=os.path.join(args.data, "alias_table.csv"))
    if not briefings:
        raise SystemExit(f"No week folders found under {os.path.join(args.data, 'weeks')}")

    os.makedirs(args.out, exist_ok=True)
    for old in glob.glob(os.path.join(args.out, "*.html")):
        os.remove(old)

    nav = [(b.week_ending, f"week-{b.week_ending.isoformat()}.html") for b in briefings]
    for b, (_, name) in zip(briefings, nav):
        page = render(b, weeks=nav)
        with open(os.path.join(args.out, name), "w", encoding="utf-8") as f:
            f.write(page)
    with open(os.path.join(args.out, "index.html"), "w", encoding="utf-8") as f:
        f.write(render(briefings[-1], weeks=nav))

    latest = briefings[-1]
    comp = latest.comparison
    print(f"Wrote {len(briefings)} weekly pages and index.html to {args.out}")
    print(f"Latest week ending {latest.week_ending}: "
          f"{len(latest.quadrants[QUADRANT_NEEDS_DECISION_NOW])} need a decision now, "
          f"{comp.count('new') + comp.count('returned')} new, {comp.count('running')} carried over, "
          f"{len(comp.closed)} closed")
    if latest.unresolved_owners:
        print(f"  Owner names not in the alias table: {latest.unresolved_owners}")


if __name__ == "__main__":
    main()
