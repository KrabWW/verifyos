#!/bin/bash
# VerifyOS 一键启动：PG(5433) + Server(8080) + Web(5174) + 自动打开浏览器
# 用法：bash start.sh   （在你的终端里跑，Ctrl+C 不影响已启动的服务）
set -e
cd "$(dirname "$0")"

# --- 加载本地密钥与配置（.env 已被 .gitignore 忽略，绝不提交）---
# 还没有 .env？跑一次 bash scripts/setup-llm.sh 即可交互式生成
if [ -f .env ]; then
  set -a; . ./.env; set +a
else
  echo "⚠️  未找到 .env：先运行 bash scripts/setup-llm.sh 配置 LLM（本次将以无 Key 模式启动）"
fi

echo "[1/4] PostgreSQL..."
if ! pg_ctl -D /tmp/verifyos-pg17 status >/dev/null 2>&1; then
  LC_ALL=en_US.UTF-8 LANG=en_US.UTF-8 pg_ctl -D /tmp/verifyos-pg17 -l /tmp/verifyos-pg17.log start
fi
pg_isready -h 127.0.0.1 -p 5433 || true

echo "[2/4] Server (8080)..."
kill $(lsof -ti:8080) 2>/dev/null || true; sleep 1
cd apps/server
# 说明：LLM_MODEL 固定用视觉模型 glm-4.5v（沿用历史行为，与 .env 的 LLM_MODEL 无关）；
#       如想跟 .env 走，把下面一行改为  LLM_MODEL="$LLM_MODEL"
nohup env -u NODE_OPTIONS -u ELECTRON_RUN_AS_NODE \
  DATABASE_URL="${DATABASE_URL:-postgres://verifyos:verifyos@127.0.0.1:5433/verifyos}" \
  LLM_API_KEY="${LLM_API_KEY:-}" \
  LLM_MODEL='glm-4.5v' \
  PATH="/Users/xielaoban/.nvm/versions/node/v24.14.0/bin:/usr/local/bin:/usr/bin:/bin" \
  node dist/main.js > /tmp/verifyos-server.log 2>&1 & disown

echo "[3/4] Web (5174)..."
kill $(lsof -ti:5174) 2>/dev/null || true; sleep 1
cd ../web
nohup env -u NODE_OPTIONS -u ELECTRON_RUN_AS_NODE \
  PATH="/Users/xielaoban/.nvm/versions/node/v24.14.0/bin:/usr/local/bin:/usr/bin:/bin" \
  node "$(pwd)/../../node_modules/vite/bin/vite.js" --port 5174 --strictPort \
  > /tmp/verifyos-vite.log 2>&1 & disown

echo "[4/4] 等待就绪..."
for i in $(seq 1 10); do
  S=$(curl -s --noproxy '*' -o /dev/null -w "%{http_code}" --max-time 2 http://127.0.0.1:8080/api/health || true)
  V=$(curl -s --noproxy '*' -o /dev/null -w "%{http_code}" --max-time 2 http://localhost:5174/ || true)
  echo "  try$i: server=$S web=$V"
  [ "$S" = "200" ] && [ "$V" = "200" ] && break
  sleep 2
done

open http://localhost:5174
echo "✓ 已在浏览器打开 http://localhost:5174"
echo "  停止：kill \$(lsof -ti:8080) \$(lsof -ti:5174)；日志：/tmp/verifyos-server.log /tmp/verifyos-vite.log"
