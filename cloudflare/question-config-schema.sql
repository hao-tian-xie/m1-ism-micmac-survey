-- Additive migration for revisioned admin-managed questionnaire modules.
-- Existing submission rows and the public survey schema are not modified.
CREATE TABLE IF NOT EXISTS questionnaire_configs (
  questionnaire_id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  config_json TEXT NOT NULL CHECK (json_valid(config_json)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS questionnaire_configs_updated_at_idx
  ON questionnaire_configs(updated_at);

-- Immutable revision history lets a submission that records its configuration
-- revision be interpreted after later edits or archives.
CREATE TABLE IF NOT EXISTS questionnaire_config_versions (
  questionnaire_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 0),
  config_json TEXT NOT NULL CHECK (json_valid(config_json)),
  created_at TEXT NOT NULL,
  PRIMARY KEY (questionnaire_id, revision)
);

CREATE INDEX IF NOT EXISTS questionnaire_config_versions_created_at_idx
  ON questionnaire_config_versions(questionnaire_id, created_at);
