import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// ---------- 最小 YAML 解析（仅支持 init 生成的配置子集：标量 / 嵌套 map / map 列表） ----------

type YamlScalar = string;
type YamlValue = YamlScalar | YamlValue[] | { [key: string]: YamlValue };

interface YamlLine {
  indent: number;
  content: string;
}

// 切分 "key: value"；无内联值时 value 为 null（表示后面跟缩进块）
function splitKeyValue(content: string): { key: string; value: string | null } {
  const idx = content.indexOf(":");
  if (idx < 0) {
    return { key: content, value: "" };
  }
  const key = content.slice(0, idx).trim();
  const raw = content.slice(idx + 1).trim();
  if (raw === "") {
    return { key, value: null };
  }
  return { key, value: parseScalar(raw) };
}

// 去除首尾引号（init 用 JSON 双引号包裹含特殊字符的值）
function parseScalar(raw: string): string {
  const s = raw.trim();
  if (s.length >= 2 && ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))) {
    return s.slice(1, -1);
  }
  return s;
}

// 解析缩进块；根据当前行是否以 "- " 开头决定是列表还是映射
function parseNode(lines: YamlLine[], pos: number, indent: number): { value: YamlValue; next: number } {
  const first = lines[pos];
  if (first.content.startsWith("- ") || first.content === "-") {
    return parseList(lines, pos, indent);
  }
  return parseMap(lines, pos, indent);
}

function parseMap(lines: YamlLine[], pos: number, indent: number): { value: { [key: string]: YamlValue }; next: number } {
  const obj: { [key: string]: YamlValue } = {};
  let i = pos;
  while (i < lines.length && lines[i].indent === indent && !lines[i].content.startsWith("- ")) {
    const { key, value } = splitKeyValue(lines[i].content);
    if (value === null) {
      // 无内联值：若下一行缩进更深则递归解析子块
      if (i + 1 < lines.length && lines[i + 1].indent > indent) {
        const child = parseNode(lines, i + 1, lines[i + 1].indent);
        obj[key] = child.value;
        i = child.next;
      } else {
        obj[key] = "";
        i++;
      }
    } else {
      obj[key] = value;
      i++;
    }
  }
  return { value: obj, next: i };
}

function parseList(lines: YamlLine[], pos: number, indent: number): { value: YamlValue[]; next: number } {
  const arr: YamlValue[] = [];
  let i = pos;
  while (i < lines.length && lines[i].indent === indent && lines[i].content.startsWith("- ")) {
    const rest = lines[i].content.slice(2).trim();
    if (rest === "") {
      arr.push("");
      i++;
      continue;
    }
    if (rest.includes(":")) {
      // 列表项为映射：先解析首行 key: value，再吸收更深缩进的字段
      const { key, value } = splitKeyValue(rest);
      const item: { [key: string]: YamlValue } = { [key]: value ?? "" };
      if (i + 1 < lines.length && lines[i + 1].indent > indent) {
        const child = parseMap(lines, i + 1, lines[i + 1].indent);
        for (const k of Object.keys(child.value)) {
          item[k] = child.value[k];
        }
        i = child.next;
      } else {
        i++;
      }
      arr.push(item);
      continue;
    }
    arr.push(parseScalar(rest));
    i++;
  }
  return { value: arr, next: i };
}

function parseYaml(text: string): { [key: string]: YamlValue } {
  const lines: YamlLine[] = [];
  for (const rawLine of text.split("\n")) {
    let line = rawLine;
    // 行尾注释：仅当 # 前有空白视为注释，避免截断 URL 片段
    const hashIdx = line.search(/\s+#/);
    if (hashIdx >= 0) {
      line = line.slice(0, hashIdx);
    }
    if (line.trim() === "" || line.trim().startsWith("#")) {
      continue;
    }
    const indent = line.length - line.trimStart().length;
    lines.push({ indent, content: line.trim() });
  }
  if (lines.length === 0) {
    return {};
  }
  return parseNode(lines, 0, lines[0].indent).value as { [key: string]: YamlValue };
}

// 用户主目录：优先读 HOME 环境变量（便于测试注入临时 HOME），回退到 os.homedir()
function homeDir(): string {
  return process.env.HOME || homedir();
}

// 用户级配置目录：~/.verifyos
export function getConfigDir(home: string = homeDir()): string {
  return join(home, ".verifyos");
}

// 全局凭据文件路径：~/.verifyos/config.json
export function getGlobalConfigPath(home: string = homeDir()): string {
  return join(getConfigDir(home), "config.json");
}

// 项目配置文件路径：<cwd>/verifyos.config.yaml
export function getProjectConfigPath(cwd: string): string {
  return join(cwd, "verifyos.config.yaml");
}

export interface GlobalConfig {
  baseUrl: string;
  token: string;
}

// 读取全局凭据（不存在或解析失败返回 null）
export function readGlobalConfig(home: string = homeDir()): GlobalConfig | null {
  const file = getGlobalConfigPath(home);
  if (!existsSync(file)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(file, "utf8")) as GlobalConfig;
  } catch {
    return null;
  }
}

// ---------- 项目配置（verifyos.config.yaml） ----------

export interface EnvironmentConfig {
  name: string;
  url: string;
}

export interface ProjectConfig {
  baseUrl?: string;
  projectName?: string;
  appUrl?: string;
  environments: EnvironmentConfig[];
}

// 读取项目配置（不存在或解析失败返回 null）
export function readProjectConfig(cwd: string): ProjectConfig | null {
  const file = getProjectConfigPath(cwd);
  if (!existsSync(file)) {
    return null;
  }
  try {
    const root = parseYaml(readFileSync(file, "utf8"));
    const baseUrl = scalarOf(root["baseUrl"]);
    const project = asMap(root["project"]);
    const app = asMap(root["app"]);
    const environments: EnvironmentConfig[] = [];
    const envList = root["environments"];
    if (Array.isArray(envList)) {
      for (const item of envList) {
        const m = asMap(item);
        const name = scalarOf(m["name"]);
        const url = scalarOf(m["url"]);
        if (name) {
          environments.push({ name, url: url ?? "" });
        }
      }
    }
    return {
      ...(baseUrl ? { baseUrl } : {}),
      ...(scalarOf(project["name"]) ? { projectName: scalarOf(project["name"]) ?? "" } : {}),
      ...(scalarOf(app["url"]) ? { appUrl: scalarOf(app["url"]) ?? "" } : {}),
      environments,
    };
  } catch {
    return null;
  }
}

function asMap(v: unknown): { [key: string]: unknown } {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return v as { [key: string]: unknown };
  }
  return {};
}

function scalarOf(v: unknown): string | undefined {
  if (typeof v === "string") {
    return v;
  }
  if (typeof v === "number") {
    return String(v);
  }
  return undefined;
}
