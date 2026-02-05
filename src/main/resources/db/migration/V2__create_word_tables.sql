-- ===========================================
-- 既存テーブル・シーケンスを全削除
-- ===========================================
DROP TABLE IF EXISTS word_tags CASCADE;
DROP TABLE IF EXISTS adjectives CASCADE;
DROP TABLE IF EXISTS nouns CASCADE;
DROP TABLE IF EXISTS verbs CASCADE;
DROP TABLE IF EXISTS adverbs CASCADE;
DROP TABLE IF EXISTS tags CASCADE;
DROP TABLE IF EXISTS word_types CASCADE;
DROP SEQUENCE IF EXISTS phrase_seq;

-- ===========================================
-- テーブル作成
-- ===========================================

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

-- Phrase sequence
CREATE SEQUENCE phrase_seq START 1 CACHE 100;

-- ===========================================
-- 初期データ投入
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
