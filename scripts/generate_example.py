"""
Writes data/example.json: the Wasla Group example, a whole company as the
page keeps it (setup, people, tasks and four weeks), for the example the
page opens with.

Wasla Group is made up. Its structure follows a setup a real Chief of Staff
made on the page, with every name, email, product and number changed.
Every task and every weekly number is written by hand to show one rule at
work; docs/dataset_key.md says which, week by week.

Each week is the task list as it stood that week. The last week is the
current one: its tasks are the live list.

Run from anywhere: python scripts/generate_example.py
"""
import json
import os

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "example.json")
WEEKS = ["2026-09-27", "2026-10-04", "2026-10-11", "2026-10-18"]

MINUTES, COM, FOOD, LABS = "Wasla Minutes", "Wasla.com", "Wasla Food", "Wasla Labs"
CENTRAL = "Wasla Central"


def metric(name, unit, target, better="higher", margin=5, kind="percent", min_count=None):
    return {"name": name, "unit": unit, "target": target, "better": better,
            "margin": margin, "marginKind": kind, "minCount": min_count}


def rating(target, margin=0.2):
    return metric("Customer rating", "out of 5", target, margin=margin, kind="points", min_count=10)


def email(name):
    return name.lower().replace(" ", ".").replace("-", "") + "@wasla.example"


SETUP = {
    "company": "Wasla Group",
    "areaKind": "business",
    "boss": "CEO",
    "areas": [
        {"name": MINUTES, "tier": "Flagship", "leader": {"name": "Farah Al Mansoori", "email": email("Farah Al Mansoori")},
         "metrics": [metric("Orders", "", 400000), rating(4.5),
                     metric("Average delivery time", "minutes", 20, better="lower", margin=10)]},
        {"name": COM, "tier": "Core", "leader": {"name": "Rahul Mehta", "email": email("Rahul Mehta")},
         "metrics": [metric("Sales", "AED", 30000000), rating(4.7, margin=0.1)]},
        {"name": FOOD, "tier": "Core", "leader": {"name": "Ahmed El-Sayed", "email": email("Ahmed El-Sayed")},
         "metrics": [metric("Orders", "", 200000), metric("On-time delivery", "%", 85, margin=2, kind="points"), rating(4.5)]},
        {"name": LABS, "tier": "Experimental", "leader": {"name": "Omar Siddiqui", "email": email("Omar Siddiqui")},
         "metrics": [metric("New customers", "", 8000, margin=10), metric("Live projects", "", 5),
                     metric("Customer churn", "%", 5, better="lower", margin=0.5, kind="points")]},
        {"name": CENTRAL, "tier": "Core", "leader": {"name": "Layla Haddad", "email": email("Layla Haddad")},
         "metrics": [metric("Cash balance", "AED", 25000000), metric("Net promoter score", "points", 70, margin=5, kind="points"),
                     metric("Staff attrition", "%", 0.5, better="lower", margin=25)]},
    ],
}

# Everyone who owns work. Priya's name also turns up as "P. Nair"; Raj and
# Rahul Mehta are two different people.
PEOPLE = [
    ("Farah Al Mansoori", MINUTES, []), ("Zayd", MINUTES, []),
    ("Rahul Mehta", COM, []), ("Raj Mehta", COM, []),
    ("Ahmed El-Sayed", FOOD, []), ("Mina", FOOD, []),
    ("Omar Siddiqui", LABS, []),
    ("Layla Haddad", CENTRAL, []), ("Reem Qassim", CENTRAL, []), ("Priya Nair", CENTRAL, ["P. Nair"]),
]

# Task titles. blocked_by holds the id of the task waited on, as the page
# keeps it.
VISA = "Clear the visa block with immigration"
ICE_CREAM = "Finish and launch the ice-cream summer campaign"
BRANDING = "Finish branding for Wasla Wash"
WASH = "Launch Wasla Wash"
RIDER_APP = "Roll out the new rider app in Sharjah, huge momentum, on the verge of a big unlock"


def task(id, area, text, owner, due, status, updated, waiting_on="", blocked_by="", decision="", moves=""):
    return {"id": id, "area": area, "task": text, "owner": owner, "due_date": due, "status": status,
            "waiting_on": waiting_on, "blocked_by": blocked_by, "decision_type": decision, "last_updated": updated,
            "decision": "", "decided_on": "", "moves_metric": moves}


def week1():
    return [
        # Central. Two yes-or-no decisions on the CEO's desk, one overdue
        # three-option decision holding up a chain of three items.
        task("t-visa", CENTRAL, f"{VISA}, pay AED 150K in fines", "Reem Qassim", "2026-10-01",
             "Waiting on decision", "2026-09-21", waiting_on="CEO", decision="Yes or no"),
        task("t-office", CENTRAL, "Approve the office move to a new Dubai floor, AED 90K fit-out", "Reem Qassim", "2026-10-09",
             "Waiting on decision", "2026-09-25", waiting_on="CEO", decision="Yes or no"),
        task("t-hiring", CENTRAL, "Ramp up hiring for Wasla Minutes", "Reem Qassim", "2026-10-31",
             "In progress", "2026-09-15", blocked_by="t-visa"),
        task("t-icecream", CENTRAL, f"{ICE_CREAM}, three options for the CEO", "Priya Nair", "2026-09-15",
             "Waiting on decision", "2026-09-10", waiting_on="CEO", decision="Pick an option"),
        task("t-branding", CENTRAL, BRANDING, "Priya Nair", "2026-09-25", "In progress", "2026-09-12", blocked_by="t-icecream"),
        task("t-workshop", CENTRAL, "Q4 brand refresh workshop", "Priya Nair", "", "In progress", "2026-09-20"),
        task("t-seller", CENTRAL, "Refresh the seller contract template for Wasla.com", "Layla Haddad", "2026-09-30",
             "In progress", "2026-09-24"),
        task("t-board", CENTRAL, "Board pack legal review", "Layla Haddad", "2026-10-01", "Open", "2026-09-23"),
        task("t-books", CENTRAL, "Close the September books", "Layla Haddad", "2026-10-05", "Open", "2026-09-26"),
        # Labs: the rest of the chain, and a pilot nobody has touched in weeks.
        task("t-wash", LABS, WASH, "Omar Siddiqui", "2026-10-05", "In progress", "2026-09-22", blocked_by="t-branding"),
        task("t-b2b", LABS, "Show the prototype for Wasla Business", "Omar Siddiqui", "2026-10-15", "Open", "2026-09-22",
             blocked_by="t-wash"),
        task("t-laundry", LABS, "Pilot corporate laundry pickups, waiting to hear back from the vendor", "Omar Siddiqui",
             "2026-10-20", "In progress", "2026-09-05"),
        # Minutes.
        task("t-stores", MINUTES, "Open three dark stores in Abu Dhabi", "Farah Al Mansoori", "2026-10-10", "In progress", "2026-09-26"),
        task("t-riders", MINUTES, "Sign the rider agency contract for Sharjah stores", "Zayd", "2026-09-24", "In progress", "2026-09-23",
             moves="Average delivery time"),
        # Wasla.com. A decision waiting on Legal, not the CEO.
        task("t-returns", COM, "Change the returns policy, waiting on Legal review", "Rahul Mehta", "2026-10-08",
             "Waiting on decision", "2026-09-25", waiting_on="Legal", decision="Yes or no"),
        task("t-payments", COM, "Add instalment payments at checkout", "Raj Mehta", "2026-10-20", "In progress", "2026-09-26"),
        # Food. Untouched since 12 Sep, written up as if it were flying, due
        # "next Tuesday" every week.
        task("t-riderapp", FOOD, RIDER_APP, "Mina", "next Tuesday", "In progress", "2026-09-12", moves="Customer rating"),
        task("t-menu", FOOD, "Menu price review with the top 50 restaurants", "Ahmed El-Sayed", "2026-10-12", "In progress", "2026-09-25"),
    ]


def edit(tasks, id, **changes):
    for t in tasks:
        if t["id"] == id:
            t.update(changes)
    return tasks


def drop(tasks, *ids):
    return [t for t in tasks if t["id"] not in ids]


def week2():
    t = week1()
    # The CEO's answers, as the Chief of Staff recorded them on the page.
    edit(t, "t-visa", task=f"{VISA}, fines paid", status="Done", last_updated="2026-09-30",
         waiting_on="", decision="Yes, go ahead", decided_on="2026-09-29")
    edit(t, "t-hiring", last_updated="2026-10-02")
    edit(t, "t-seller", status="Done", last_updated="2026-09-30")
    edit(t, "t-board", status="Done", last_updated="2026-10-01")
    edit(t, "t-books", status="Done", last_updated="2026-10-03")
    edit(t, "t-riders", status="Done", last_updated="2026-10-01")
    edit(t, "t-stores", last_updated="2026-10-02")
    edit(t, "t-payments", last_updated="2026-10-02")
    edit(t, "t-menu", last_updated="2026-10-01")
    t.append(task("t-sameday", COM, "Launch same-day delivery in Abu Dhabi, three options in the memo", "Rahul Mehta",
                  "2026-10-16", "Waiting on decision", "2026-10-02", waiting_on="CEO", decision="Pick an option"))
    return t


def week3():
    # Starting a week drops what was done the week before (weekly.startWeek).
    t = drop(week2(), "t-visa", "t-seller", "t-board", "t-books", "t-riders")
    edit(t, "t-icecream", task=f"{ICE_CREAM}, launched", status="Done", last_updated="2026-10-07",
         waiting_on="", decision="Chose: option two, the smaller launch", decided_on="2026-10-06")
    edit(t, "t-office", status="Done", last_updated="2026-10-06", waiting_on="", decision="Yes, go ahead", decided_on="2026-10-06")
    edit(t, "t-returns", task="Change the returns policy, Legal approved", status="Done", last_updated="2026-10-08")
    edit(t, "t-workshop", due_date="2026-10-22", last_updated="2026-10-09")
    edit(t, "t-hiring", last_updated="2026-10-09")
    edit(t, "t-stores", status="Done", last_updated="2026-10-09")
    edit(t, "t-payments", last_updated="2026-10-09")
    edit(t, "t-menu", due_date="2026-10-26", last_updated="2026-10-08")
    t.append(task("t-provider", COM, "Extend the payments provider contract by 12 months", "Raj Mehta", "2026-10-23",
                  "Waiting on decision", "2026-10-08", waiting_on="CEO", decision="Yes or no"))
    # The laundry pilot is deleted from the tracker, never marked done.
    return drop(t, "t-laundry")


def week4():
    t = drop(week3(), "t-icecream", "t-office", "t-returns", "t-stores")
    edit(t, "t-branding", status="Done", last_updated="2026-10-14")
    edit(t, "t-wash", last_updated="2026-10-16")
    edit(t, "t-hiring", last_updated="2026-10-16")
    edit(t, "t-payments", last_updated="2026-10-15")
    edit(t, "t-menu", last_updated="2026-10-15")
    t.append(task("t-guidelines", CENTRAL, "Brand guidelines for Wasla Business", "Priya Nair", "2026-10-22", "Open", "2026-10-16"))
    return t


def m(area, name, value, count=""):
    return {"area": area, "metric": name, "segment": "", "value": str(value), "target": "", "count": str(count)}


def metrics(minutes_time, food_rating, labs=True):
    rows = [
        m(MINUTES, "Orders", 412000), m(MINUTES, "Customer rating", 4.4, 21000), m(MINUTES, "Average delivery time", minutes_time),
        m(COM, "Sales", 31200000), m(COM, "Customer rating", 4.66, 8400),
        m(FOOD, "Orders", 205000), m(FOOD, "On-time delivery", 84.1), m(FOOD, "Customer rating", food_rating, 12000),
        m(CENTRAL, "Cash balance", 26500000), m(CENTRAL, "Net promoter score", 72), m(CENTRAL, "Staff attrition", 0.45),
    ]
    if labs:
        rows += [m(LABS, "New customers", 8300), m(LABS, "Live projects", 5), m(LABS, "Customer churn", 4.8)]
    return rows


ALL_AREAS = [a["name"] for a in SETUP["areas"]]
ALL_PEOPLE = [p[0] for p in PEOPLE]

# Minutes' delivery time misses in weeks 1 and 2 (it is Flagship already, so
# no item moves). Food's rating misses in week 4 and lifts its items. Labs
# sends no numbers in week 4.
WEEK_DATA = [
    (week1(), metrics(23.5, 4.4), ALL_AREAS),
    (week2(), metrics(22.8, 4.4), ALL_AREAS),
    (week3(), metrics(20.5, 4.4), ALL_AREAS),
    (week4(), metrics(20.1, 4.1, labs=False), [a for a in ALL_AREAS if a != LABS]),
]

example = {
    "format": "chief-of-staff-briefing backup",
    "version": 3,
    "workspace": "example",
    "setup": SETUP,
    "people": [{"name": n, "email": email(n), "area": a, "spellings": s} for n, a, s in PEOPLE],
    "tasks": WEEK_DATA[-1][0],
    "weeks": [
        {"weekEnding": w, "tasks": tasks if i < len(WEEKS) - 1 else None, "metrics": rows,
         "received": {"metrics": received, "tasks": ALL_PEOPLE}}
        for i, (w, (tasks, rows, received)) in enumerate(zip(WEEKS, WEEK_DATA))
    ],
    "notes": [],
    "settings": {"cosEmail": "chief.of.staff@wasla.example"},
}

with open(OUT, "w") as f:
    json.dump(example, f, indent=2)
    f.write("\n")
print("wrote", os.path.abspath(OUT))
