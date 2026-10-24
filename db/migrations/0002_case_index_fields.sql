-- Fields and tables needed to load the researched case index
-- (data/merged-canonical-*.csv). See docs/historical_figure_system_design.md.

-- Migration bookkeeping ------------------------------------------------------

CREATE TABLE schema_migration (
    version     text PRIMARY KEY,
    applied_at  timestamptz NOT NULL DEFAULT now()
);
INSERT INTO schema_migration (version) VALUES ('0001_init'), ('0002_case_index_fields');

-- New enumerations -----------------------------------------------------------

CREATE TYPE case_priority AS ENUM ('core', 'expansion');
CREATE TYPE research_status AS ENUM ('pending', 'drafted', 'ready_for_review');
CREATE TYPE source_type AS ENUM ('primary', 'secondary', 'reference');
CREATE TYPE case_relationship AS ENUM ('counterexample', 'conditional_contrast', 'comparative_pair', 'no_forced_pair');
CREATE TYPE fit_strength AS ENUM ('strong', 'moderate', 'weak_moderate', 'weak', 'not_applicable');

-- Decision case additions ----------------------------------------------------

ALTER TABLE decision_case
    ADD COLUMN priority                case_priority,
    ADD COLUMN primary_theme           text CHECK (primary_theme IN ('Negotiation', 'Leadership', 'Uncertainty', 'Commitment')),
    ADD COLUMN unknowns                jsonb NOT NULL DEFAULT '[]'::jsonb,  -- information gaps at the time (pre-decision)
    ADD COLUMN approx_age_at_decision  text,
    ADD COLUMN disputed_points         text,                                -- post-decision: historians' disagreements
    ADD COLUMN research_status         research_status NOT NULL DEFAULT 'pending',
    ADD COLUMN research_notes          text;                                -- reviewer-facing, never shown to users

CREATE INDEX decision_case_primary_theme_idx ON decision_case (primary_theme);

ALTER TABLE event ADD COLUMN region text;   -- cultural region / tradition, e.g. "Chinese", "Transatlantic"

ALTER TABLE source ADD COLUMN source_type source_type;

-- Who holds the view a passage expresses (a disputed claim can be supported
-- by one author and contradicted by another)
ALTER TABLE claim_passage ADD COLUMN attribution text;

-- Lexical search over the mechanism description ("when should this case be retrieved")
ALTER TABLE mechanism_annotation
    ADD COLUMN search_tsv tsvector GENERATED ALWAYS AS (
        to_tsvector('english', coalesce(mechanism_description, ''))
    ) STORED;
CREATE INDEX mechanism_annotation_tsv_idx ON mechanism_annotation USING gin (search_tsv);

-- Curated relationships between cases (canonical-pairs.csv) ------------------

CREATE TABLE case_relation (
    relation_id        text PRIMARY KEY,                       -- P01, P02, ...
    case_a             text NOT NULL REFERENCES decision_case ON DELETE CASCADE,
    case_b             text REFERENCES decision_case ON DELETE CASCADE,  -- NULL for 'no_forced_pair'
    relationship       case_relationship NOT NULL,
    decision_question  text NOT NULL,
    fit_strength       fit_strength NOT NULL,
    critical_limit     text,
    change_note        text,                                   -- research provenance, reviewer-facing
    CHECK (case_b IS NOT NULL OR relationship = 'no_forced_pair'),
    CHECK (case_b IS NULL OR case_b <> case_a)
);
CREATE INDEX case_relation_case_a_idx ON case_relation (case_a);
CREATE INDEX case_relation_case_b_idx ON case_relation (case_b);

-- Recreate the public view so it includes the new columns --------------------

DROP VIEW approved_case;
CREATE VIEW approved_case AS
SELECT dc.*, ma.mechanism_tags, ma.mechanism_description, ma.reversibility,
       ma.relationship, ma.horizon
FROM decision_case dc
LEFT JOIN mechanism_annotation ma USING (case_id)
WHERE dc.review_status = 'approved';
