CREATE TABLE IF NOT EXISTS submissions (
  client_submission_id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL UNIQUE,
  received_at TEXT NOT NULL,
  record_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS submissions_received_at_idx
  ON submissions(received_at);

CREATE TABLE IF NOT EXISTS submission_feedback_access (
  submission_id TEXT PRIMARY KEY,
  feedback_token_hash TEXT NOT NULL,
  q7_answer TEXT,
  submitted_at TEXT,
  FOREIGN KEY(submission_id) REFERENCES submissions(submission_id)
);
