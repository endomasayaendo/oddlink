-- Word Types
CREATE TABLE word_types (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(20) NOT NULL UNIQUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO word_types (name) VALUES
    ('ADJECTIVE'),
    ('NOUN'),
    ('VERB'),
    ('ADVERB');

-- Tags (shared across all word types)
CREATE TABLE tags (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(30) NOT NULL UNIQUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO tags (name) VALUES
    ('color'),
    ('state'),
    ('texture'),
    ('impression'),
    ('animal'),
    ('object'),
    ('nature'),
    ('daily'),
    ('abstract'),
    ('action'),
    ('change'),
    ('manner'),
    ('frequency');

-- Adjectives table
CREATE TABLE adjectives (
    id BIGSERIAL PRIMARY KEY,
    word VARCHAR(50) NOT NULL UNIQUE,
    word_type_id BIGINT NOT NULL REFERENCES word_types(id),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Nouns table
CREATE TABLE nouns (
    id BIGSERIAL PRIMARY KEY,
    word VARCHAR(50) NOT NULL UNIQUE,
    word_type_id BIGINT NOT NULL REFERENCES word_types(id),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Verbs table
CREATE TABLE verbs (
    id BIGSERIAL PRIMARY KEY,
    word VARCHAR(50) NOT NULL UNIQUE,
    word_type_id BIGINT NOT NULL REFERENCES word_types(id),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Adverbs table
CREATE TABLE adverbs (
    id BIGSERIAL PRIMARY KEY,
    word VARCHAR(50) NOT NULL UNIQUE,
    word_type_id BIGINT NOT NULL REFERENCES word_types(id),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Word Tags (many-to-many relationship)
CREATE TABLE word_tags (
    word_type_id BIGINT NOT NULL REFERENCES word_types(id),
    word_id BIGINT NOT NULL,
    tag_id BIGINT NOT NULL REFERENCES tags(id),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (word_type_id, word_id, tag_id)
);

-- Phrase sequence
CREATE SEQUENCE phrase_seq START 1 CACHE 100;

-- Insert adjectives (word_type_id = 1)
INSERT INTO adjectives (word, word_type_id) VALUES
    ('purple', 1), ('golden', 1), ('silver', 1), ('crimson', 1), ('ivory', 1),
    ('azure', 1), ('amber', 1), ('obsidian', 1), ('copper', 1), ('pearl', 1),
    ('broken', 1), ('floating', 1), ('sleeping', 1), ('frozen', 1), ('burning', 1),
    ('melting', 1), ('spinning', 1), ('falling', 1), ('rising', 1), ('vanishing', 1),
    ('velvet', 1), ('hollow', 1), ('transparent', 1), ('heavy', 1), ('fragile', 1),
    ('smooth', 1), ('rusted', 1), ('polished', 1), ('cracked', 1), ('soft', 1),
    ('silent', 1), ('distant', 1), ('ancient', 1), ('forgotten', 1), ('hidden', 1),
    ('endless', 1), ('sudden', 1), ('gentle', 1), ('fierce', 1), ('patient', 1);

-- Insert nouns (word_type_id = 2)
INSERT INTO nouns (word, word_type_id) VALUES
    ('cat', 2), ('whale', 2), ('crow', 2), ('butterfly', 2), ('fox', 2),
    ('owl', 2), ('elephant', 2), ('rabbit', 2), ('wolf', 2), ('moth', 2),
    ('clock', 2), ('piano', 2), ('mirror', 2), ('key', 2), ('door', 2),
    ('window', 2), ('chair', 2), ('lamp', 2), ('book', 2), ('candle', 2),
    ('moon', 2), ('river', 2), ('mountain', 2), ('cloud', 2), ('rain', 2),
    ('snow', 2), ('forest', 2), ('ocean', 2), ('star', 2), ('sun', 2),
    ('teacup', 2), ('umbrella', 2), ('glasses', 2), ('envelope', 2), ('coin', 2),
    ('thread', 2), ('button', 2), ('needle', 2), ('jar', 2), ('feather', 2),
    ('shadow', 2), ('echo', 2), ('dream', 2), ('silence', 2), ('memory', 2);

-- Insert verbs (word_type_id = 3)
INSERT INTO verbs (word, word_type_id) VALUES
    ('whispers', 3), ('dances', 3), ('falls', 3), ('waits', 3), ('watches', 3),
    ('sleeps', 3), ('wakes', 3), ('runs', 3), ('hides', 3), ('seeks', 3),
    ('sings', 3), ('counts', 3), ('reads', 3), ('writes', 3), ('draws', 3),
    ('becomes', 3), ('dissolves', 3), ('transforms', 3), ('fades', 3), ('blooms', 3),
    ('melts', 3), ('freezes', 3), ('burns', 3), ('grows', 3), ('shrinks', 3),
    ('breaks', 3), ('bends', 3), ('spills', 3), ('scatters', 3), ('gathers', 3);

-- Insert adverbs (word_type_id = 4)
INSERT INTO adverbs (word, word_type_id) VALUES
    ('gently', 4), ('slowly', 4), ('quietly', 4), ('suddenly', 4), ('softly', 4),
    ('deeply', 4), ('briefly', 4), ('barely', 4), ('silently', 4), ('gracefully', 4),
    ('swiftly', 4), ('carefully', 4), ('wildly', 4),
    ('endlessly', 4), ('almost', 4), ('forever', 4), ('never', 4), ('always', 4),
    ('once', 4), ('twice', 4);

-- Insert word_tags (optional, can be added later for analysis)
-- Example: color adjectives
INSERT INTO word_tags (word_type_id, word_id, tag_id) VALUES
    (1, 1, 1), (1, 2, 1), (1, 3, 1), (1, 4, 1), (1, 5, 1),
    (1, 6, 1), (1, 7, 1), (1, 8, 1), (1, 9, 1), (1, 10, 1);

-- Example: state adjectives
INSERT INTO word_tags (word_type_id, word_id, tag_id) VALUES
    (1, 11, 2), (1, 12, 2), (1, 13, 2), (1, 14, 2), (1, 15, 2),
    (1, 16, 2), (1, 17, 2), (1, 18, 2), (1, 19, 2), (1, 20, 2);

-- Example: animal nouns
INSERT INTO word_tags (word_type_id, word_id, tag_id) VALUES
    (2, 1, 5), (2, 2, 5), (2, 3, 5), (2, 4, 5), (2, 5, 5),
    (2, 6, 5), (2, 7, 5), (2, 8, 5), (2, 9, 5), (2, 10, 5);
