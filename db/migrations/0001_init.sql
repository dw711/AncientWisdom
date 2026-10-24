-- Historical Figure corpus schema (see docs/historical_figure_system_design.md §4.2)
-- Target: Tiger Cloud service "historical_figures" (PostgreSQL + pgvector)

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Enumerations ---------------------------------------------------------------

CREATE TYPE review_status AS ENUM ('draft', 'in_review', 'approved', 'retired');
CREATE TYPE date_precision AS ENUM ('day', 'month', 'year', 'decade', 'century', 'approximate');
CREATE TYPE claim_type AS ENUM ('observation', 'interpretation', 'outcome');
CREATE TYPE support_status AS ENUM ('unreviewed', 'supported', 'disputed', 'contradicted', 'insufficient_evidence');
CREATE TYPE passage_relation AS ENUM ('supports', 'contradicts');
CREATE TYPE reversibility AS ENUM ('reversible', 'partly_reversible', 'irreversible', 'unknown');
CREATE TYPE relationship_kind AS ENUM ('repeated', 'one_shot', 'unknown');
CREATE TYPE representation_type AS ENUM ('situation', 'mechanism');
CREATE TYPE request_status AS ENUM ('ready', 'needs_clarification', 'insufficient_evidence', 'partial', 'error');
CREATE TYPE feedback_kind AS ENUM ('helpful', 'misleading', 'factually_wrong');

-- Corpus versions: every response cites exactly one ---------------------------

CREATE TABLE corpus_version (
    corpus_version  text PRIMARY KEY,
    published_at    timestamptz,
    notes           text,
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- Sources and passages (relational, for stable evidence identity) -------------

CREATE TABLE source (
    source_id         text PRIMARY KEY,
    title             text NOT NULL,
    author            text,
    institution       text,
    url               text,
    publication_date  text,           -- free text: may be partial or uncertain
    retrieved_at      timestamptz,
    rights            jsonb NOT NULL DEFAULT '{}'::jsonb,  -- licence, excerpt-only, etc.
    content_hash      text,
    created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE passage (
    passage_id    text PRIMARY KEY,
    source_id     text NOT NULL REFERENCES source ON DELETE RESTRICT,
    text          text NOT NULL,
    locator       text,               -- page / section / paragraph
    language      text NOT NULL DEFAULT 'en',
    content_hash  text NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (source_id, content_hash)
);
CREATE INDEX passage_source_idx ON passage (source_id);

-- Events and decision cases --------------------------------------------------

CREATE TABLE event (
    event_id        text PRIMARY KEY,
    title           text NOT NULL,
    start_year      integer,          -- negative for BCE; never a fabricated exact day
    end_year        integer,
    start_date      date,             -- only when precisely known
    end_date        date,
    date_precision  date_precision NOT NULL DEFAULT 'approximate',
    date_display    text,             -- era-aware label, e.g. "c. 260 BCE", "战国末期"
    geography       text,
    participants    jsonb NOT NULL DEFAULT '[]'::jsonb,
    created_at      timestamptz NOT NULL DEFAULT now(),
    CHECK (end_year IS NULL OR start_year IS NULL OR end_year >= start_year)
);

CREATE TABLE decision_case (
    case_id                text PRIMARY KEY,
    event_id               text REFERENCES event ON DELETE RESTRICT,
    version                integer NOT NULL DEFAULT 1,
    title                  text NOT NULL,
    decision               text NOT NULL,          -- what decision was being made
    -- Pre-decision fields: safe to show Jev during structural scoring
    context_before         text NOT NULL,
    situation_summary      text,                   -- anonymised, outcome-free search text
    actors                 jsonb NOT NULL DEFAULT '[]'::jsonb,
    goals                  jsonb NOT NULL DEFAULT '[]'::jsonb,
    available_information  jsonb NOT NULL DEFAULT '[]'::jsonb,
    constraints            jsonb NOT NULL DEFAULT '[]'::jsonb,
    options                jsonb NOT NULL DEFAULT '[]'::jsonb,
    -- Post-decision fields: fetched only after structural selection
    chosen_action          text,
    outcome                text,
    outcome_uncertainty    text,
    analogy_limits         jsonb NOT NULL DEFAULT '[]'::jsonb,
    themes                 text[] NOT NULL DEFAULT '{}',   -- negotiation, leadership, ...
    language               text NOT NULL DEFAULT 'en',
    review_status          review_status NOT NULL DEFAULT 'draft',
    reviewed_by            text,
    reviewed_at            timestamptz,
    created_at             timestamptz NOT NULL DEFAULT now(),
    updated_at             timestamptz NOT NULL DEFAULT now(),
    -- Lexical search over pre-decision text only (no outcome leakage)
    search_tsv             tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(decision, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(situation_summary, '')), 'B') ||
        setweight(to_tsvector('english', coalesce(context_before, '')), 'C')
    ) STORED
);
CREATE INDEX decision_case_event_idx ON decision_case (event_id);
CREATE INDEX decision_case_status_idx ON decision_case (review_status);
CREATE INDEX decision_case_tsv_idx ON decision_case USING gin (search_tsv);
CREATE INDEX decision_case_themes_idx ON decision_case USING gin (themes);

-- Which case versions belong to which published corpus version
CREATE TABLE corpus_version_case (
    corpus_version  text NOT NULL REFERENCES corpus_version ON DELETE CASCADE,
    case_id         text NOT NULL REFERENCES decision_case ON DELETE RESTRICT,
    case_version    integer NOT NULL,
    PRIMARY KEY (corpus_version, case_id)
);

-- Claims, with links to supporting / contradicting passages ------------------

CREATE TABLE claim (
    claim_id        text PRIMARY KEY,
    case_id         text NOT NULL REFERENCES decision_case ON DELETE CASCADE,
    statement       text NOT NULL,
    claim_type      claim_type NOT NULL,
    attribution     text,             -- who holds this interpretation, if any
    support_status  support_status NOT NULL DEFAULT 'unreviewed',
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX claim_case_idx ON claim (case_id);

CREATE TABLE claim_passage (
    claim_id    text NOT NULL REFERENCES claim ON DELETE CASCADE,
    passage_id  text NOT NULL REFERENCES passage ON DELETE RESTRICT,
    relation    passage_relation NOT NULL,
    PRIMARY KEY (claim_id, passage_id)
);
CREATE INDEX claim_passage_passage_idx ON claim_passage (passage_id);

-- Mechanism annotations -----------------------------------------------------

CREATE TABLE mechanism_annotation (
    case_id                text PRIMARY KEY REFERENCES decision_case ON DELETE CASCADE,
    mechanism_tags         text[] NOT NULL DEFAULT '{}',  -- credible_commitment, escalation, ...
    mechanism_description  text,                          -- second search representation
    incentives             jsonb NOT NULL DEFAULT '[]'::jsonb,
    reversibility          reversibility NOT NULL DEFAULT 'unknown',
    relationship           relationship_kind NOT NULL DEFAULT 'unknown',
    horizon                text,
    provenance             jsonb NOT NULL DEFAULT '{}'::jsonb,  -- annotator, model, reviewed?
    updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mechanism_tags_idx ON mechanism_annotation USING gin (mechanism_tags);

-- Embeddings (1536 dims assumed; change with the embedding model) ------------

CREATE TABLE case_embedding (
    case_id              text NOT NULL REFERENCES decision_case ON DELETE CASCADE,
    representation_type  representation_type NOT NULL,
    embedding_model      text NOT NULL,
    case_version         integer NOT NULL,
    embedding            vector(1536) NOT NULL,
    created_at           timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (case_id, representation_type, embedding_model, case_version)
);
-- Exact scan is fine for ~30 cases. At thousands of cases add:
-- CREATE INDEX ON case_embedding USING hnsw (embedding vector_cosine_ops);

-- Operational tables (no raw dilemma text by default) -------------------------

CREATE TABLE request_trace (
    request_id       uuid PRIMARY KEY,
    created_at       timestamptz NOT NULL DEFAULT now(),
    client           text,            -- website, claude_mcp, chatgpt_mcp
    status           request_status NOT NULL,
    error_code       text,
    corpus_version   text REFERENCES corpus_version,
    rubric_version   text,
    model_versions   jsonb NOT NULL DEFAULT '{}'::jsonb,
    stage_timings_ms jsonb NOT NULL DEFAULT '{}'::jsonb,
    selected_cases   jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{case_id, case_version, analogy_fit}]
    token_usage      jsonb NOT NULL DEFAULT '{}'::jsonb,
    cost_usd         numeric(10, 6)
);
CREATE INDEX request_trace_created_idx ON request_trace (created_at);

CREATE TABLE feedback (
    feedback_id       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    request_id        uuid REFERENCES request_trace ON DELETE SET NULL,
    case_id           text REFERENCES decision_case ON DELETE SET NULL,
    kind              feedback_kind NOT NULL,
    comment           text,
    consent_to_store  boolean NOT NULL DEFAULT false,
    retain_until      timestamptz,
    created_at        timestamptz NOT NULL DEFAULT now(),
    CHECK (comment IS NULL OR consent_to_store)
);

-- Public retrieval sees approved cases only -----------------------------------

CREATE VIEW approved_case AS
SELECT dc.*, ma.mechanism_tags, ma.mechanism_description, ma.reversibility,
       ma.relationship, ma.horizon
FROM decision_case dc
LEFT JOIN mechanism_annotation ma USING (case_id)
WHERE dc.review_status = 'approved';
