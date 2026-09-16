-- Additive, non-destructive migration for live questionnaire configuration.
CREATE TABLE IF NOT EXISTS questionnaire_configs (
  questionnaire_id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  config_json TEXT NOT NULL CHECK (json_valid(config_json)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS questionnaire_configs_updated_at_idx
  ON questionnaire_configs(updated_at);

CREATE TABLE IF NOT EXISTS questionnaire_config_versions (
  questionnaire_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 0),
  config_json TEXT NOT NULL CHECK (json_valid(config_json)),
  created_at TEXT NOT NULL,
  PRIMARY KEY (questionnaire_id, revision)
);

CREATE INDEX IF NOT EXISTS questionnaire_config_versions_created_at_idx
  ON questionnaire_config_versions(questionnaire_id, created_at);
