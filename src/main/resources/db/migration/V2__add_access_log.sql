CREATE TABLE access_log (
    id BIGSERIAL PRIMARY KEY,
    url_mapping_id BIGINT NOT NULL REFERENCES url_mappings(id) ON DELETE CASCADE,
    accessed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_access_log_url_mapping_id ON access_log(url_mapping_id);
CREATE INDEX idx_access_log_accessed_at ON access_log(accessed_at);
