-- VerifyOS 数据模型 v1（B1 工单）
-- 对齐 PRD §2.2 执行模型细化 + qa-tech调研反推模型
-- 层级：Organization → Project → Application(web/mobile/api) → Environment(含 preview)
-- 依赖：Resume From（恰 1 个，6h 复用）/ Wait For（多个）+ Output Values / Clipboard

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============ 组织与项目 ============
CREATE TABLE IF NOT EXISTS organization (
  id          bigserial PRIMARY KEY,
  short_id    text NOT NULL UNIQUE,
  name        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS project (
  id          bigserial PRIMARY KEY,
  short_id    text NOT NULL UNIQUE,
  org_id      bigint NOT NULL REFERENCES organization(id),
  name        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ============ 应用（三类型）与环境（含 Preview） ============
CREATE TABLE IF NOT EXISTS application (
  id          bigserial PRIMARY KEY,
  short_id    text NOT NULL UNIQUE,
  project_id  bigint NOT NULL REFERENCES project(id),
  name        text NOT NULL,
  type        text NOT NULL CHECK (type IN ('web','mobile','api')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS environment (
  id              bigserial PRIMARY KEY,
  short_id        text NOT NULL UNIQUE,
  application_id  bigint NOT NULL REFERENCES application(id),
  name            text NOT NULL,
  url             text NOT NULL,
  is_preview      boolean NOT NULL DEFAULT false,
  branch          text,
  pr_number       int,
  max_concurrent  int,                    -- 空 = 不限（per-environment 并发上限）
  is_production   boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_environment_app ON environment(application_id);
CREATE INDEX IF NOT EXISTS idx_environment_preview ON environment(is_preview) WHERE is_preview;

-- ============ 凭据与浏览器状态 ============
CREATE TABLE IF NOT EXISTS credential (
  id          bigserial PRIMARY KEY,
  short_id    text NOT NULL UNIQUE,
  project_id  bigint NOT NULL REFERENCES project(id),
  name        text NOT NULL,
  role        text,
  type        text NOT NULL DEFAULT 'password',   -- password / otp / totp / magic_link / basic
  payload_enc text NOT NULL,                      -- AES-256 加密后的负载（凭据体系统一管理）
  created_at  timestamptz NOT NULL DEFAULT now(),
  rotated_at  timestamptz
);

-- Browser State：cookies+localStorage+sessionStorage 快照（Resume From 的状态载体）
CREATE TABLE IF NOT EXISTS browser_state (
  id              bigserial PRIMARY KEY,
  short_id        text NOT NULL UNIQUE,
  environment_id  bigint NOT NULL REFERENCES environment(id),
  name            text NOT NULL,             -- 如 admin_logged_in
  origin_run_id   bigint,
  storage_uri     text NOT NULL,             -- MinIO 上的状态快照 URI
  captured_at     timestamptz NOT NULL DEFAULT now(),
  -- 复用窗口 6 小时（qa.tech 对齐）：captured_at + 6h 内可直接 Resume From
  expires_at      timestamptz NOT NULL DEFAULT (now() + interval '6 hours')
);
CREATE INDEX IF NOT EXISTS idx_browser_state_env ON browser_state(environment_id);

-- ============ 探索（Crawling）与 Coverage Graph ============
CREATE TABLE IF NOT EXISTS exploration (
  id              bigserial PRIMARY KEY,
  short_id        text NOT NULL UNIQUE,
  application_id  bigint NOT NULL REFERENCES application(id),
  environment_id  bigint REFERENCES environment(id),
  intent          varchar(500),              -- Crawling Intent ≤500 字符
  start_url       text NOT NULL,
  max_depth       int NOT NULL DEFAULT 1,    -- 0-10
  max_actions     int NOT NULL DEFAULT 300,  -- 1-1000
  status          text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing','complete','failed','cancelled')),
  output_state_id bigint REFERENCES browser_state(id),  -- 从某测试最终浏览器状态恢复
  created_at      timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz
);

CREATE TABLE IF NOT EXISTS exploration_iteration (
  id              bigserial PRIMARY KEY,
  exploration_id  bigint NOT NULL REFERENCES exploration(id),
  url             text NOT NULL,
  depth           int NOT NULL DEFAULT 0,
  source_action   text,                      -- 如何到达（'n/a' 为起始页）
  intent_score    int,                       -- 0-100（分档 0-40/41-70/71-100）
  screenshot_uri  text,
  found_actions   jsonb NOT NULL DEFAULT '[]'::jsonb,   -- 发现的交互元素
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_iter_exploration ON exploration_iteration(exploration_id);

-- Coverage Graph（page/flow/element 节点 + navigate/act 边）
CREATE TABLE IF NOT EXISTS graph_node (
  id              bigserial PRIMARY KEY,
  application_id  bigint NOT NULL REFERENCES application(id),
  type            text NOT NULL CHECK (type IN ('page','flow','element')),
  ref             text NOT NULL,             -- URL 或语义 key
  title           text,
  embedding       vector(1024),              -- pgvector：页面语义去重/相似
  meta            jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(application_id, type, ref)
);
CREATE TABLE IF NOT EXISTS graph_edge (
  id              bigserial PRIMARY KEY,
  application_id  bigint NOT NULL REFERENCES application(id),
  from_node       bigint NOT NULL REFERENCES graph_node(id),
  to_node         bigint NOT NULL REFERENCES graph_node(id),
  action          text NOT NULL,             -- navigate / click_xx / fill_xx
  meta            jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(from_node, to_node, action)
);

-- ============ QA 点与验证 ============
CREATE TABLE IF NOT EXISTS qa_point (
  id              bigserial PRIMARY KEY,
  short_id        text NOT NULL UNIQUE,
  application_id  bigint NOT NULL REFERENCES application(id),
  title           text NOT NULL,
  category        text,                      -- 权限/正常流程/校验/边界/状态/并发…
  risk            text CHECK (risk IN ('high','medium','low')),
  status          text NOT NULL DEFAULT 'discovered' CHECK (status IN
                    ('discovered','selected','draft','generated','ready','running','passed','failed','unknown','confirmed')),
  confidence      numeric(4,3),
  source          jsonb NOT NULL DEFAULT '{}'::jsonb,   -- requirementRef/figmaRef/explorationId
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_qa_app ON qa_point(application_id);

CREATE TABLE IF NOT EXISTS verification (
  id              bigserial PRIMARY KEY,
  short_id        text NOT NULL UNIQUE,
  qa_point_id     bigint NOT NULL REFERENCES qa_point(id),
  title           text NOT NULL,
  actor           text,                      -- 角色（管理员/普通用户）
  steps           jsonb NOT NULL DEFAULT '[]'::jsonb,   -- 步骤 DAG（module/ai/deterministic/assertion）
  status          text NOT NULL DEFAULT 'draft',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- 依赖边：Resume From（恰 1 个）/ Wait For（多个）
CREATE TABLE IF NOT EXISTS dependency (
  id                  bigserial PRIMARY KEY,
  verification_id     bigint NOT NULL REFERENCES verification(id),
  depends_on_id       bigint NOT NULL REFERENCES verification(id),
  kind                text NOT NULL CHECK (kind IN ('resume_from','wait_for')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE(verification_id, depends_on_id),
  CHECK (verification_id <> depends_on_id)
);
-- 每个 verification 恰好最多 1 个 Resume From（qa.tech 对齐）
CREATE UNIQUE INDEX IF NOT EXISTS uq_dependency_one_resume_from
  ON dependency(verification_id) WHERE kind = 'resume_from';

-- ============ Run / Step / Evidence ============
CREATE TABLE IF NOT EXISTS run (
  id              bigserial PRIMARY KEY,
  short_id        text NOT NULL UNIQUE,
  verification_id bigint REFERENCES verification(id),
  target          jsonb NOT NULL,            -- RunTarget（applicationShortId/platform/environment/devicePreset）
  trigger         text NOT NULL DEFAULT 'manual' CHECK (trigger IN ('manual','schedule','pr','api')),
  verdict         text CHECK (verdict IN ('pass','fail','unknown')),
  failure_summary text,
  output          jsonb NOT NULL DEFAULT '{}'::jsonb,   -- Output Values（跨会话传递）
  duration_ms     bigint,
  created_at      timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz
);
CREATE INDEX IF NOT EXISTS idx_run_verification ON run(verification_id);
CREATE INDEX IF NOT EXISTS idx_run_created ON run(created_at DESC);

CREATE TABLE IF NOT EXISTS step (
  id              bigserial PRIMARY KEY,
  short_id        text NOT NULL UNIQUE,
  run_id          bigint NOT NULL REFERENCES run(id),
  idx             int NOT NULL,
  title           text NOT NULL,
  kind            text NOT NULL CHECK (kind IN ('module','ai','deterministic','assertion')),
  verdict         text CHECK (verdict IN ('pass','fail','unknown')),
  cache_hit       boolean,
  duration_ms     bigint,
  UNIQUE(run_id, idx)
);

CREATE TABLE IF NOT EXISTS evidence (
  id              bigserial PRIMARY KEY,
  short_id        text NOT NULL UNIQUE,
  run_id          bigint NOT NULL REFERENCES run(id),
  step_id         bigint REFERENCES step(id),
  kind            text NOT NULL CHECK (kind IN ('screenshot','video','network','console','trace','log')),
  uri             text NOT NULL,             -- MinIO URI
  meta            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_evidence_run ON evidence(run_id);

-- Output Values（Agent 显式保存，依赖链数据流）
CREATE TABLE IF NOT EXISTS output_value (
  id              bigserial PRIMARY KEY,
  run_id          bigint NOT NULL REFERENCES run(id),
  key             text NOT NULL,
  value           text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(run_id, key)
);

-- ============ T16: 元素定位缓存（ai 指令 → 确定性 selector 跨重启持久化） ============
CREATE TABLE IF NOT EXISTS locator_cache (
  instruction  text PRIMARY KEY,
  selector     text NOT NULL,
  action       text NOT NULL,
  value        text,
  hits         int NOT NULL DEFAULT 0,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- ============ Test Plan 与设备预设 ============
CREATE TABLE IF NOT EXISTS test_plan (
  id              bigserial PRIMARY KEY,
  short_id        text NOT NULL UNIQUE,
  project_id      bigint NOT NULL REFERENCES project(id),
  name            text NOT NULL,
  -- per-application 的 environment + device preset 配置集
  -- 优先级：项目默认 < Test Plan < 单次 Run API override
  config          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS device_preset (
  id              bigserial PRIMARY KEY,
  short_id        text NOT NULL UNIQUE,
  project_id      bigint NOT NULL REFERENCES project(id),
  name            text NOT NULL,
  platform        text NOT NULL CHECK (platform IN ('web','mobile','api')),
  config          jsonb NOT NULL DEFAULT '{}'::jsonb,   -- 设备/OS/Viewport 等
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ============ F11: MR（GitLab Merge Request + VerifyOS Review） ============
CREATE TABLE IF NOT EXISTS mr (
  id              bigserial PRIMARY KEY,
  iid             integer NOT NULL UNIQUE,           -- GitLab MR !iid
  title           text NOT NULL,
  state           text NOT NULL DEFAULT 'opened',    -- opened / merged / closed
  author          text NOT NULL DEFAULT '',
  repo            text NOT NULL DEFAULT '',
  source_branch   text NOT NULL DEFAULT '',
  target_branch   text NOT NULL DEFAULT 'main',
  additions       integer NOT NULL DEFAULT 0,
  deletions       integer NOT NULL DEFAULT 0,
  running         boolean NOT NULL DEFAULT false,    -- 验证进行中（Review 未产出）
  review          jsonb,                             -- {verdict, summary, checkedAt, areas[], tests[], bot}
  run_id          text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ============ 审计 ============
CREATE TABLE IF NOT EXISTS audit_log (
  id              bigserial PRIMARY KEY,
  project_id      bigint REFERENCES project(id),
  actor           text NOT NULL DEFAULT 'system',
  action          text NOT NULL,             -- credential.use / tool.call / permission.change …
  target          text,
  meta            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_project ON audit_log(project_id, created_at DESC);

-- 迁移记录表 _migrations 由 scripts/migrate.ts 的 bootstrap 幂等创建（勿在此重复，pg-mem 对已存在表的 IF NOT EXISTS+列约束有规划器 bug）
