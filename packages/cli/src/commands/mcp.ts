import { startMcpServer } from "../mcp-server.js";

// verifyos mcp：启动 stdio MCP server，供编码 Agent（Cursor / Claude Code）连接
export function runMcp(): void {
  startMcpServer();
}
