-- ===========================================
-- OddLink 初期スキーマ
-- ===========================================

-- URL Mappings
CREATE TABLE url_mappings (
    id BIGSERIAL PRIMARY KEY,
    short_code VARCHAR(255) NOT NULL UNIQUE,
    original_url TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL,
    expires_at TIMESTAMP,
    access_count BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX idx_url_mappings_short_code ON url_mappings(short_code);

-- Word Tables
CREATE TABLE adjectives (
    id BIGSERIAL PRIMARY KEY,
    word VARCHAR(50) NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE nouns (
    id BIGSERIAL PRIMARY KEY,
    word VARCHAR(50) NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE verbs (
    id BIGSERIAL PRIMARY KEY,
    word VARCHAR(50) NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE adverbs (
    id BIGSERIAL PRIMARY KEY,
    word VARCHAR(50) NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ===========================================
-- Initial Data
-- ===========================================

INSERT INTO adjectives (word) VALUES
    ('purple'), ('golden'), ('silver'), ('crimson'), ('ivory'),
    ('azure'), ('amber'), ('obsidian'), ('copper'), ('pearl'),
    ('broken'), ('floating'), ('sleeping'), ('frozen'), ('burning'),
    ('melting'), ('spinning'), ('falling'), ('rising'), ('vanishing'),
    ('velvet'), ('hollow'), ('transparent'), ('heavy'), ('fragile'),
    ('smooth'), ('rusted'), ('polished'), ('cracked'), ('soft'),
    ('silent'), ('distant'), ('ancient'), ('forgotten'), ('hidden'),
    ('endless'), ('sudden'), ('gentle'), ('fierce'), ('patient');

INSERT INTO nouns (word) VALUES
    ('cat'), ('whale'), ('crow'), ('butterfly'), ('fox'),
    ('owl'), ('elephant'), ('rabbit'), ('wolf'), ('moth'),
    ('clock'), ('piano'), ('mirror'), ('key'), ('door'),
    ('window'), ('chair'), ('lamp'), ('book'), ('candle'),
    ('moon'), ('river'), ('mountain'), ('cloud'), ('rain'),
    ('snow'), ('forest'), ('ocean'), ('star'), ('sun'),
    ('teacup'), ('umbrella'), ('glasses'), ('envelope'), ('coin'),
    ('thread'), ('button'), ('needle'), ('jar'), ('feather'),
    ('shadow'), ('echo'), ('dream'), ('silence'), ('memory');

INSERT INTO verbs (word) VALUES
    ('whispers'), ('dances'), ('falls'), ('waits'), ('watches'),
    ('sleeps'), ('wakes'), ('runs'), ('hides'), ('seeks'),
    ('sings'), ('counts'), ('reads'), ('writes'), ('draws'),
    ('becomes'), ('dissolves'), ('transforms'), ('fades'), ('blooms'),
    ('melts'), ('freezes'), ('burns'), ('grows'), ('shrinks'),
    ('breaks'), ('bends'), ('spills'), ('scatters'), ('gathers');

INSERT INTO adverbs (word) VALUES
    ('gently'), ('slowly'), ('quietly'), ('suddenly'), ('softly'),
    ('deeply'), ('briefly'), ('barely'), ('silently'), ('gracefully'),
    ('swiftly'), ('carefully'), ('wildly'),
    ('endlessly'), ('almost'), ('forever'), ('never'), ('always'),
    ('once'), ('twice');
