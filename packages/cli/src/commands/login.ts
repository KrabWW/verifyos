import { mkdirSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { getConfigDir, getGlobalConfigPath } from "../config.js";

interface LoginArgs {
  baseUrl?: string;
  token?: string;
}

// 解析 login 参数：<baseUrl> [--token <TOKEN>]（也支持 --token=<TOKEN>）
function parseLoginArgs(args: string[]): LoginArgs {
  const result: LoginArgs = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--token") {
      result.token = args[++i];
    } else if (arg.startsWith("--token=")) {
      result.token = arg.slice("--token=".length);
    } else if (arg.startsWith("--")) {
      console.error("未知参数：" + arg);
      process.exitCode = 1;
    } else if (result.baseUrl === undefined) {
      result.baseUrl = arg;
    } else {
      console.error("多余参数：" + arg);
      process.exitCode = 1;
    }
  }
  return result;
}

// 交互式读取 token（stdin 输入，不回显）
function promptToken(): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question("请输入 API Token: ", (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// 脱敏显示 token：仅显示前后各 4 位
function mask(token: string): string {
  if (token.length <= 8) {
    return "****";
  }
  return token.slice(0, 4) + "..." + token.slice(-4);
}

// 执行 login：持久化 baseUrl + token 到 ~/.verifyos/config.json
export async function runLogin(args: string[]): Promise<void> {
  const { baseUrl, token: tokenArg } = parseLoginArgs(args);

  if (!baseUrl) {
    console.error("用法：verifyos login <baseUrl> [--token <TOKEN>]");
    process.exitCode = 1;
    return;
  }

  let token = tokenArg;
  if (!token) {
    token = await promptToken();
  }
  if (!token) {
    console.error("Token 不能为空");
    process.exitCode = 1;
    return;
  }

  const dir = getConfigDir();
  mkdirSync(dir, { recursive: true });
  const file = getGlobalConfigPath();
  writeFileSync(file, JSON.stringify({ baseUrl, token }, null, 2) + "\n", "utf8");

  console.log("已保存登录信息到：" + file);
  console.log("baseUrl: " + baseUrl);
  console.log("token: " + mask(token));
}
