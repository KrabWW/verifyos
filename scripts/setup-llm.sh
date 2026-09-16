#!/bin/bash
# VerifyOS · LLM 配置向导（交互式）
#
# 用法：bash scripts/setup-llm.sh
#
# 作用：生成/更新仓库根目录的 .env（已被 .gitignore 忽略，绝不会提交）。
#       只会改动 LLM_BASE_URL / LLM_MODEL / LLM_API_KEY 三行，其余内容原样保留。
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE=.env

if [ ! -f "$ENV_FILE" ]; then
  cp .env.example "$ENV_FILE"
  echo "✓ 已从 .env.example 生成 $ENV_FILE"
else
  echo "✓ 检测到已有 ${ENV_FILE}（只会更新 LLM 三项，其余不动）"
fi

cat <<'MENU'

选择 LLM 提供商：
  1) 智谱 GLM    https://open.bigmodel.cn  （默认 glm-4.6；视觉任务可用 glm-4.5v）
  2) DeepSeek    https://api.deepseek.com  （deepseek-chat / deepseek-reasoner）
  3) 自定义      任意 OpenAI 兼容端点（vLLM / Ollama / OneAPI…）

MENU
printf '请输入序号 [1]: '
read -r choice
choice="${choice:-1}"

case "$choice" in
  1)
    base_url="https://open.bigmodel.cn/api/paas/v4"
    model="glm-4.6"
    key_hint="申请 Key：https://bigmodel.cn → 控制台 → API Keys"
    ;;
  2)
    base_url="https://api.deepseek.com/v1"
    model="deepseek-chat"
    key_hint="申请 Key：https://platform.deepseek.com → API Keys"
    ;;
  3)
    key_hint="填写你的 OpenAI 兼容端点信息"
    printf 'Base URL (如 https://api.example.com/v1): '
    read -r base_url
    [ -n "$base_url" ] || { echo "✗ Base URL 不能为空"; exit 1; }
    printf '模型名   (如 qwen3-32b): '
    read -r model
    [ -n "$model" ] || { echo "✗ 模型名不能为空"; exit 1; }
    ;;
  *)
    echo "✗ 无效选项：$choice"; exit 1 ;;
esac

echo
echo "$key_hint"
printf '粘贴 API Key: '
read -r api_key
[ -n "$api_key" ] || { echo "✗ API Key 不能为空"; exit 1; }

# upsert：有则原位替换、无则追加（awk 实现，macOS/Linux 通用，不依赖 sed -i）
upsert() {
  local tmp
  tmp="$(mktemp)"
  awk -v k="$1" -v v="$2" 'BEGIN{FS=OFS="="} $1==k{$0=k"="v; f=1} {print} END{if(!f) print k"="v}' "$ENV_FILE" > "$tmp"
  mv "$tmp" "$ENV_FILE"
}
upsert LLM_BASE_URL "$base_url"
upsert LLM_MODEL    "$model"
upsert LLM_API_KEY  "$api_key"
chmod 600 "$ENV_FILE"

echo
echo "✓ 已写入 $ENV_FILE → LLM_BASE_URL=$base_url · LLM_MODEL=$model · LLM_API_KEY=***（权限已设 600）"

# 安全兜底：确认 .env 一定被 git 忽略
if git rev-parse --is-inside-work-tree >/dev/null 2>&1 && ! git check-ignore -q "$ENV_FILE"; then
  echo "⚠️  危险：$ENV_FILE 未被 .gitignore 忽略！请先在 .gitignore 加入一行 .env"
  exit 1
fi
echo "✓ 安全检查通过：$ENV_FILE 被 .gitignore 忽略，不会被提交"

echo
echo "下一步："
echo "  本地开发    bash start.sh"
echo "  私有化部署  见 DEPLOY.md（docker compose -f docker-compose.prod.yml up -d --build）"
