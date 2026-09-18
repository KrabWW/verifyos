-- 004: 登录配方（login_recipe）——修「验证生成时登录步骤写死」问题
-- 背景：verifications.controller.ts / runs.service.ts / browser-states.controller.ts
-- 曾把 admin/test123/#username 登录模块硬编码给所有应用，对真实目标（如 cp-test.ruijie.com
-- 的 Ruijie IDS SSO）完全无效。本表把登录步骤模板数据化：
--   - 按项目（project_id）存一条配方；steps 为 StepDef[] JSON，值用 {{username}}/{{password}} 占位
--   - 生成验证/试运行时按 sourceUrl host 匹配项目 → 渲染占位符（按角色解密凭据）
--   - demo 项目配方与原硬编码行为一致（回滚安全）；真实站点配方用条件式 ai 步（已验证可跑通）

CREATE TABLE IF NOT EXISTS login_recipe (
  id          bigserial PRIMARY KEY,
  short_id    text NOT NULL UNIQUE,
  project_id  bigint NOT NULL REFERENCES project(id),
  name        text NOT NULL,
  start_url   text NOT NULL DEFAULT '',
  steps       jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_login_recipe_project ON login_recipe(project_id);

-- 种子 FK 安全（审查 a 项）：fresh DB 上 project 表为空（project 由 explore.service.ts 运行时
-- 种子），直接 INSERT project_id=1/2 会 FK 违规回滚 → 整个迁移失败、特性静默消失。
-- 改为 INSERT ... SELECT ... WHERE p.id = N（等价 WHERE EXISTS 守卫：project 存在才插）。
-- 已应用的 DB 不重跑本迁移；fresh DB 上 project 运行时建好后，由
-- LoginRecipesService.ensureRecipes()（运行时自愈种子，SQL 与下面两条等价）补种。

-- demo 项目（演示 CRM，本地 fixture）：与原硬编码完全一致（admin/test123/#username → list.html）
INSERT INTO login_recipe(short_id, project_id, name, start_url, steps)
SELECT 'lr_demo', p.id, '演示 CRM 登录（fixture）', '', '[
  {"id":"st_l1","title":"管理员登录","kind":"module","actions":[
    {"type":"fill","selector":"#username","value":"{{username}}"},
    {"type":"fill","selector":"#password","value":"{{password}}"},
    {"type":"click","selector":"button[type=\"submit\"]"}
  ]},
  {"id":"st_l2","title":"登录成功断言","kind":"assertion","assert":{"kind":"url_contains","value":"list.html"},"targetRef":"list.html"}
]'::jsonb
FROM project p WHERE p.id = 1
ON CONFLICT (short_id) DO NOTHING;

-- 大合规平台（cp-test.ruijie.com，Ruijie IDS SSO）：条件式 ai 登录（已登录则跳过）
INSERT INTO login_recipe(short_id, project_id, name, start_url, steps)
SELECT 'lr_cptest', p.id, '大合规平台 SSO 登录（cp-test）', 'https://cp-test.ruijie.com/', '[
  {"id":"st_l1","title":"打开站点","kind":"deterministic","goto":"https://cp-test.ruijie.com/"},
  {"id":"st_l2","title":"登录（如已登录则跳过）","kind":"ai","instruction":"如果页面显示 Ruijie IDS 登录表单：在 Enter your account 输入框填入 {{username}}。如果已在系统内（左侧有菜单），什么都不做"},
  {"id":"st_l3","title":"填密码（如需要）","kind":"ai","instruction":"如果页面显示密码输入框（Please enter Password）：在其中填入 {{password}}。如果没有密码框，什么都不做"},
  {"id":"st_l4","title":"点登录（如需要）","kind":"ai","instruction":"如果页面显示 Sign In 按钮：点击它。如果不在登录页，什么都不做"}
]'::jsonb
FROM project p WHERE p.id = 2
ON CONFLICT (short_id) DO NOTHING;
