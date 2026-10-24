# /// script
# requires-python = ">=3.11"
# dependencies = ["psycopg[binary]>=3.2"]
# ///
"""Load the researched case index (data/merged-canonical-*.csv) into Postgres.

Usage:
    DATABASE_URL=postgresql://... uv run backend/app/ingest/import_csv.py [--data-dir data] [--dry-run]

Safe to re-run. Everything is imported as review_status = 'draft'; approving a
case is a separate, human step. If a case's content changes on re-import, its
version is bumped and it returns to 'draft' even if it had been approved.
"""

import argparse
import csv
import hashlib
import json
import os
import re
import sys
from pathlib import Path

import psycopg
from psycopg.types.json import Jsonb

CASES_FILE = "merged-canonical-cases.csv"
EVIDENCE_FILE = "merged-canonical-evidence.csv"
PAIRS_FILE = "merged-canonical-pairs.csv"

PRIMARY_THEMES = {"Negotiation", "Leadership", "Uncertainty", "Commitment"}
REVERSIBILITY = {"reversible", "partly_reversible", "irreversible", "unknown"}
RELATIONSHIP = {"repeated", "one_shot", "unknown"}
DATE_PRECISION = {"day", "month", "year", "decade", "century", "approximate"}
RESEARCH_STATUS = {"pending", "drafted", "ready_for_review"}
CLAIM_TYPES = {"observation", "interpretation", "outcome"}
RELATIONS = {"supports", "contradicts"}
SOURCE_TYPES = {"primary", "secondary", "reference"}
PAIR_RELATIONSHIP = {
    "Counterexample": "counterexample",
    "Conditional contrast": "conditional_contrast",
    "Comparative pair": "comparative_pair",
    "No forced pair": "no_forced_pair",
}
FIT_STRENGTH = {
    "Strong": "strong",
    "Moderate": "moderate",
    "Weak–moderate": "weak_moderate",
    "Weak-moderate": "weak_moderate",
    "Weak": "weak",
    "N/A": "not_applicable",
}
# Matches the "(chosen ...)" annotation the researchers put on chosen options.
CHOSEN_RE = re.compile(r"\s*\(([^()]*\bchosen\b[^()]*)\)", re.IGNORECASE)


def read_csv(path):
    with open(path, encoding="utf-8-sig", newline="") as f:
        return [{k: (v or "").strip() for k, v in row.items()} for row in csv.DictReader(f)]


def split_list(value):
    return [item.strip() for item in value.split(" | ") if item.strip()]


def split_names(value):
    return [n.strip() for n in re.split(r",\s*and\s+|,\s*|\s+and\s+", value) if n.strip()]


def parse_options(value):
    """Separate the outcome ("chosen") from the option text so pre-decision
    scoring never sees which option was taken."""
    options = []
    for item in split_list(value):
        match = CHOSEN_RE.search(item)
        if match:
            text = (item[: match.start()] + item[match.end():]).strip()
            options.append({"text": text, "chosen": True, "note": match.group(1).strip()})
        else:
            options.append({"text": item, "chosen": False})
    return options


def optional_int(value):
    return int(value) if value else None


def check(errors, ok, message):
    if not ok:
        errors.append(message)


def validate(cases, evidence, pairs):
    errors = []
    case_ids = [c["Case ID"] for c in cases]
    check(errors, len(case_ids) == len(set(case_ids)), "duplicate Case IDs")
    for c in cases:
        cid = c["Case ID"]
        check(errors, c["Primary theme"] in PRIMARY_THEMES, f"{cid}: bad Primary theme {c['Primary theme']!r}")
        check(errors, c["Reversibility"] in REVERSIBILITY, f"{cid}: bad Reversibility {c['Reversibility']!r}")
        check(errors, c["Relationship"] in RELATIONSHIP, f"{cid}: bad Relationship {c['Relationship']!r}")
        check(errors, c["Date precision"] in DATE_PRECISION, f"{cid}: bad Date precision {c['Date precision']!r}")
        check(errors, c["Research status"] in RESEARCH_STATUS, f"{cid}: bad Research status {c['Research status']!r}")
        check(errors, c["Priority"] in {"Core", "Expansion"}, f"{cid}: bad Priority {c['Priority']!r}")
        for field in ("Decision moment", "Decision", "Context before"):
            check(errors, bool(c[field]), f"{cid}: empty {field}")
    known = set(case_ids)
    claims = {}
    for e in evidence:
        claim_id = e["Claim ID"]
        check(errors, e["Case ID"] in known, f"{claim_id}: unknown Case ID {e['Case ID']}")
        check(errors, e["Claim type"] in CLAIM_TYPES, f"{claim_id}: bad Claim type {e['Claim type']!r}")
        check(errors, e["Relation"] in RELATIONS, f"{claim_id}: bad Relation {e['Relation']!r}")
        check(errors, e["Source type"] in SOURCE_TYPES, f"{claim_id}: bad Source type {e['Source type']!r}")
        check(errors, bool(e["Passage"]), f"{claim_id}: empty Passage")
        check(errors, bool(e["Source ID"]), f"{claim_id}: empty Source ID")
        key = (e["Case ID"], e["Claim"], e["Claim type"])
        check(errors, claims.setdefault(claim_id, key) == key, f"{claim_id}: inconsistent claim rows")
    for p in pairs:
        check(errors, p["Relationship"] in PAIR_RELATIONSHIP, f"{p['Pair ID']}: bad Relationship {p['Relationship']!r}")
        check(errors, p["Fit strength"] in FIT_STRENGTH, f"{p['Pair ID']}: bad Fit strength {p['Fit strength']!r}")
    return errors


def upsert_case(cur, c):
    cid = c["Case ID"]
    event_id = f"E-{cid}"
    names = split_names(c["Figure(s)"])
    cur.execute(
        """
        INSERT INTO event (event_id, title, start_year, end_year, date_precision,
                           date_display, geography, region, participants)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (event_id) DO UPDATE SET
            title = EXCLUDED.title, start_year = EXCLUDED.start_year,
            end_year = EXCLUDED.end_year, date_precision = EXCLUDED.date_precision,
            date_display = EXCLUDED.date_display, geography = EXCLUDED.geography,
            region = EXCLUDED.region, participants = EXCLUDED.participants
        """,
        (event_id, c["Decision moment"], optional_int(c["Start year"]), optional_int(c["End year"]),
         c["Date precision"], c["Date"], "; ".join(split_list(c["Geography"])) or None,
         c["Region / tradition"] or None, Jsonb(names)),
    )

    # Primary theme first, then tags, then any labels from the original "Theme" column.
    themes = [c["Primary theme"]]
    for t in split_list(c["Theme tags"]) + [p.strip() for p in c["Theme"].split("/")]:
        if t and t.lower() not in {x.lower() for x in themes}:
            themes.append(t)
    row = {
        "case_id": cid,
        "event_id": event_id,
        "title": c["Decision moment"],
        "decision": c["Decision"],
        "context_before": c["Context before"],
        "situation_summary": c["Problem"] or None,
        # "figures" is a best-effort split; show "display" to users.
        "actors": Jsonb({"display": c["Figure(s)"], "figures": names, "role": c["Actor role"] or None}),
        "goals": Jsonb(split_list(c["Goals"])),
        "available_information": Jsonb(split_list(c["Available information"])),
        "unknowns": Jsonb(split_list(c["Unknowns at the time"])),
        "constraints": Jsonb(split_list(c["Constraints"])),
        "options": Jsonb(parse_options(c["Options"])),
        "chosen_action": c["Response"] or None,
        "outcome": c["Outcome"] or None,
        "outcome_uncertainty": c["Outcome / caveat"] or None,
        "disputed_points": c["Disputed points"] or None,
        "analogy_limits": Jsonb(split_list(c["Analogy limits"])),
        "themes": themes,
        "primary_theme": c["Primary theme"],
        "priority": c["Priority"].lower(),
        "approx_age_at_decision": c["Approx. age at decision"] or None,
        "research_status": c["Research status"],
        "research_notes": c["Research notes"] or None,
    }
    cols = list(row)
    content = [k for k in cols if k != "case_id"]
    cur.execute(
        f"""
        INSERT INTO decision_case ({", ".join(cols)})
        VALUES ({", ".join(f"%({k})s" for k in cols)})
        ON CONFLICT (case_id) DO UPDATE SET
            {", ".join(f"{k} = EXCLUDED.{k}" for k in content)},
            version = decision_case.version + 1,
            review_status = 'draft', reviewed_by = NULL, reviewed_at = NULL,
            updated_at = now()
        WHERE ({", ".join(f"decision_case.{k}" for k in content)})
              IS DISTINCT FROM ({", ".join(f"EXCLUDED.{k}" for k in content)})
        RETURNING (xmax = 0) AS inserted
        """,
        row,
    )
    result = cur.fetchone()
    status = "unchanged" if result is None else ("inserted" if result[0] else "updated")

    cur.execute(
        """
        INSERT INTO mechanism_annotation (case_id, mechanism_tags, mechanism_description,
                                          reversibility, relationship, horizon, provenance, updated_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s, now())
        ON CONFLICT (case_id) DO UPDATE SET
            mechanism_tags = EXCLUDED.mechanism_tags,
            mechanism_description = EXCLUDED.mechanism_description,
            reversibility = EXCLUDED.reversibility, relationship = EXCLUDED.relationship,
            horizon = EXCLUDED.horizon, provenance = EXCLUDED.provenance, updated_at = now()
        """,
        (cid, split_list(c["Mechanism tags"]), c["When J should retrieve"] or None,
         c["Reversibility"], c["Relationship"], c["Horizon"] or None,
         Jsonb({"source_file": f"data/{CASES_FILE}", "reviewed": False})),
    )
    return status


def import_evidence(cur, evidence):
    source_rows, passages, claims, links, attributions = {}, {}, {}, {}, {}
    for e in evidence:
        sid = e["Source ID"]
        source_rows.setdefault(sid, []).append(e)
        digest = hashlib.sha256(e["Passage"].encode()).hexdigest()
        pid = f"{sid}-{digest[:12]}"
        passages.setdefault(pid, (sid, e["Passage"], e["Locator"] or None, digest))
        claims.setdefault(e["Claim ID"], e)
        links[(e["Claim ID"], pid)] = (e["Relation"], e["Attribution"] or None)
        # A disputed claim has different attributions per passage; the claim
        # keeps them all, each link keeps its own.
        if e["Attribution"] and e["Attribution"] not in attributions.setdefault(e["Claim ID"], []):
            attributions[e["Claim ID"]].append(e["Attribution"])

    # The same source can be described slightly differently on different rows:
    # keep the fullest value of each field, and every distinct rights note.
    sources = {}
    for sid, rows in source_rows.items():
        merged = dict(rows[0])
        for field in ("Source title", "Author / institution", "Publication date", "Accessed"):
            merged[field] = max((r[field] for r in rows), key=len)
        notes = []
        for r in rows:
            for part in r["Rights note"].split(";"):
                if part.strip() and part.strip() not in notes:
                    notes.append(part.strip())
        merged["Rights note"] = "; ".join(notes)
        merged["Title variants"] = sorted({r["Source title"] for r in rows} - {merged["Source title"]})
        sources[sid] = merged

    for sid, e in sources.items():
        rights = {"note": e["Rights note"]} if e["Rights note"] else {}
        cur.execute(
            """
            INSERT INTO source (source_id, title, author, url, publication_date,
                                retrieved_at, rights, source_type)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (source_id) DO UPDATE SET
                title = EXCLUDED.title, author = EXCLUDED.author, url = EXCLUDED.url,
                publication_date = EXCLUDED.publication_date,
                retrieved_at = EXCLUDED.retrieved_at, rights = EXCLUDED.rights,
                source_type = EXCLUDED.source_type
            """,
            (sid, e["Source title"], e["Author / institution"] or None, e["Source URL"] or None,
             e["Publication date"] or None, e["Accessed"] or None,
             Jsonb(rights | ({"title_variants": e["Title variants"]} if e["Title variants"] else {})),
             e["Source type"]),
        )

    for pid, (sid, text, locator, digest) in passages.items():
        cur.execute(
            """
            INSERT INTO passage (passage_id, source_id, text, locator, content_hash)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (passage_id) DO UPDATE SET locator = EXCLUDED.locator
            """,
            (pid, sid, text, locator, digest),
        )

    for claim_id, e in claims.items():
        # A changed statement needs re-review, so its support status is reset.
        cur.execute(
            """
            INSERT INTO claim (claim_id, case_id, statement, claim_type, attribution)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (claim_id) DO UPDATE SET
                case_id = EXCLUDED.case_id, statement = EXCLUDED.statement,
                claim_type = EXCLUDED.claim_type, attribution = EXCLUDED.attribution,
                support_status = 'unreviewed'
            WHERE (claim.case_id, claim.statement, claim.claim_type, claim.attribution)
                  IS DISTINCT FROM (EXCLUDED.case_id, EXCLUDED.statement, EXCLUDED.claim_type, EXCLUDED.attribution)
            """,
            (claim_id, e["Case ID"], e["Claim"], e["Claim type"],
             "; ".join(attributions.get(claim_id, [])) or None),
        )

    # Replace links for the imported cases so removed CSV rows disappear too.
    case_ids = sorted({e["Case ID"] for e in evidence})
    cur.execute(
        "DELETE FROM claim WHERE case_id = ANY(%s) AND NOT (claim_id = ANY(%s))",
        (case_ids, list(claims)),
    )
    cur.execute(
        "DELETE FROM claim_passage cp USING claim c WHERE cp.claim_id = c.claim_id AND c.case_id = ANY(%s)",
        (case_ids,),
    )
    cur.executemany(
        "INSERT INTO claim_passage (claim_id, passage_id, relation, attribution) VALUES (%s, %s, %s, %s)",
        [(cid, pid, rel, attr) for (cid, pid), (rel, attr) in links.items()],
    )

    return len(sources), len(passages), len(claims), len(links)


def import_pairs(cur, pairs):
    cur.execute("SELECT case_id FROM decision_case")
    known = {r[0] for r in cur.fetchall()}
    loaded, skipped = 0, []
    for p in pairs:
        missing = [c for c in (p["Case A"], p["Case B"]) if c and c not in known]
        if missing:
            skipped.append(f"{p['Pair ID']} (case {', '.join(missing)} not imported yet)")
            continue
        cur.execute(
            """
            INSERT INTO case_relation (relation_id, case_a, case_b, relationship,
                                       decision_question, fit_strength, critical_limit, change_note)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (relation_id) DO UPDATE SET
                case_a = EXCLUDED.case_a, case_b = EXCLUDED.case_b,
                relationship = EXCLUDED.relationship,
                decision_question = EXCLUDED.decision_question,
                fit_strength = EXCLUDED.fit_strength,
                critical_limit = EXCLUDED.critical_limit, change_note = EXCLUDED.change_note
            """,
            (p["Pair ID"], p["Case A"], p["Case B"] or None, PAIR_RELATIONSHIP[p["Relationship"]],
             p["Decision question"], FIT_STRENGTH[p["Fit strength"]],
             p["Critical limit"] or None, p.get("Change note") or None),
        )
        loaded += 1
    return loaded, skipped


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--data-dir", default="data", type=Path)
    parser.add_argument("--dry-run", action="store_true", help="run everything, then roll back")
    args = parser.parse_args()

    cases = read_csv(args.data_dir / CASES_FILE)
    evidence = read_csv(args.data_dir / EVIDENCE_FILE)
    pairs = read_csv(args.data_dir / PAIRS_FILE)

    errors = validate(cases, evidence, pairs)
    if errors:
        print("Validation failed; nothing was written:", *errors, sep="\n  ", file=sys.stderr)
        sys.exit(1)

    url = os.environ.get("DATABASE_URL")
    if not url:
        sys.exit("DATABASE_URL is not set")

    with psycopg.connect(url) as conn, conn.cursor() as cur:
        statuses = [upsert_case(cur, c) for c in cases]
        n_sources, n_passages, n_claims, n_links = import_evidence(cur, evidence)
        n_pairs, skipped = import_pairs(cur, pairs)

        summary = {s: statuses.count(s) for s in ("inserted", "updated", "unchanged")}
        print(f"cases: {json.dumps(summary)}")
        print(f"sources: {n_sources}, passages: {n_passages}, claims: {n_claims}, claim-passage links: {n_links}")
        print(f"pairs loaded: {n_pairs}")
        for s in skipped:
            print(f"  skipped pair {s}")
        if args.dry_run:
            conn.rollback()
            print("dry run: rolled back")


if __name__ == "__main__":
    main()
