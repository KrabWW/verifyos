-- T9: 多项目 ↔ 多 repo / 多 environment 关联（增量 DDL，幂等）
-- 层级说明：第一版只做「项目」一级（单租户）。
--   project_repo        ：一个项目绑多个 GitLab/GitHub 仓库（repo_url + kind）。
--   project_environment ：项目级环境（测试/预发/生产，name + url）。
--   与 application 级 environment 表区分：后者承载 PR preview（is_preview/branch/pr_number），
--   仍由 packages/agent-core preview 链路使用，本表不侵入。

CREATE TABLE IF NOT EXISTS project_repo (
  id          bigserial PRIMARY KEY,
  project_id  bigint NOT NULL REFERENCES project(id),
  repo_url    text NOT NULL,
  kind        text NOT NULL DEFAULT 'gitlab' CHECK (kind IN ('gitlab','github')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, repo_url)
);
CREATE INDEX IF NOT EXISTS idx_project_repo_project ON project_repo(project_id);
CREATE INDEX IF NOT EXISTS idx_project_repo_url ON project_repo(repo_url);

CREATE TABLE IF NOT EXISTS project_environment (
  id            bigserial PRIMARY KEY,
  project_id    bigint NOT NULL REFERENCES project(id),
  name          text NOT NULL,
  url           text NOT NULL DEFAULT '',
  is_production boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, name)
);
CREATE INDEX IF NOT EXISTS idx_project_environment_project ON project_environment(project_id);
