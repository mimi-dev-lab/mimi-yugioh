-- OpenClaw Dashboard Tables

-- 系统指标时序数据
CREATE TABLE IF NOT EXISTS openclaw_metrics (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ DEFAULT now(),
  tokens_input INT DEFAULT 0,
  tokens_output INT DEFAULT 0,
  cost_usd DECIMAL(10,4) DEFAULT 0,
  active_sessions INT DEFAULT 0,
  memory_files INT DEFAULT 0,
  skills_count INT DEFAULT 0,
  projects_count INT DEFAULT 0
);

-- Cron 执行历史
CREATE TABLE IF NOT EXISTS openclaw_cron_runs (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ DEFAULT now(),
  job_id TEXT NOT NULL,
  job_name TEXT,
  status TEXT,
  duration_ms INT,
  error_message TEXT
);

-- 启用 Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE openclaw_metrics;
ALTER PUBLICATION supabase_realtime ADD TABLE openclaw_cron_runs;

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_metrics_ts ON openclaw_metrics(ts DESC);
CREATE INDEX IF NOT EXISTS idx_cron_runs_ts ON openclaw_cron_runs(ts DESC);
CREATE INDEX IF NOT EXISTS idx_cron_runs_job ON openclaw_cron_runs(job_id);
