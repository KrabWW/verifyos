import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { getProjectConfigPath } from "../config.js";

// 简单 YAML 字符串处理：仅当值含特殊字符时用双引号包裹（JSON 双引号字符串在 YAML 中合法）
function yamlValue(value: string): string {
  if (/^[A-Za-z0-9._/-]+$/.test(value)) {
    return value;
  }
  return JSON.stringify(value);
}

// 生成可读、含注释的 verifyos.config.yaml 内容
function buildConfig(projectName: string): string {
  return `# VerifyOS 项目配置
# 由 \`verifyos init\` 生成，可提交到仓库供团队评审。
# 字段说明：
#   project.name     项目标识（默认取当前目录名）
#   app.url          被测应用入口 URL
#   environments     测试环境列表（name + url）
#   credential.role  凭据角色，用于从 ~/.verifyos/config.json 选择 token
#   llm.model        默认 LLM 模型

# 项目标识
project:
  name: ${yamlValue(projectName)}

# 被测应用入口
app:
  url: https://example.com

# 测试环境列表（可按需增删）
environments:
  - name: dev
    url: https://dev.example.com
  - name: staging
    url: https://staging.example.com

# 凭据引用（角色名，对应 login 时保存的凭据）
credential:
  role: default

# LLM 模型
llm:
  model: gpt-4o-mini
`;
}

// 执行 init：文件不存在才生成；已存在则提示并打印现有内容摘要
export function runInit(cwd: string): void {
  const file = getProjectConfigPath(cwd);

  if (existsSync(file)) {
    console.log("已存在，跳过：" + file);
    console.log("--- 现有内容摘要 ---");
    console.log(readFileSync(file, "utf8"));
    return;
  }

  const projectName = basename(cwd) || "verifyos-project";
  writeFileSync(file, buildConfig(projectName), "utf8");
  console.log("已生成：" + file);
}
