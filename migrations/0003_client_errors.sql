-- E4：前端错误上报（functions/api/report.ts）。只存最近 30 天，按 IP 限次
CREATE TABLE client_errors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  message TEXT NOT NULL,
  stack TEXT,
  url TEXT,
  ua TEXT,
  build TEXT,
  ip TEXT
);
CREATE INDEX client_errors_at ON client_errors(at);
