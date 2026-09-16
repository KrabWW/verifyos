# VerifyOS 私有化部署（E3）

> 目标：一台干净 Linux 服务器（2C4G 起，Docker 24+），**30 分钟内起服**。
> 全栈组成：PostgreSQL 16(+pgvector) · Redis 7 · MinIO · server（NestJS）· web（React/nginx）。

---

## 1. 前置检查（~2 分钟）

```bash
docker --version          # ≥ 24
docker compose version    # ≥ v2.20
git --version
```

防火墙放行：`8081`（Web 控制台）、`8080`（API，内网可不开）。

## 2. 拉代码 + 配置（~3 分钟）

```bash
git clone <repo-url> verifyos && cd verifyos
bash scripts/setup-llm.sh   # 交互式配置 LLM（推荐）；或 cp .env.example .env 后按注释手动编辑
```

`.env` 必填 3 项：

```bash
# ① 智谱 API Key（ explores/验证的 LLM 引擎 ）
LLM_API_KEY=你的智谱key

# ② 凭据加密 key（一次性生成，⚠️ 生成后妥善保管——换了它历史凭据将无法解密）
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# 输出粘到 CREDENTIAL_ENCRYPTION_KEY=

# ③ Web 端口（默认 8081 可不改）
WEB_PORT=8081
```

## 3. 一键起服（~15 分钟，含镜像构建）

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

编排内容：

| 服务 | 说明 | 端口 |
|---|---|---|
| postgres | PG16 + pgvector（数据持久卷 `pgdata`） | 内部 5432 |
| redis | 任务队列 | 内部 6379 |
| minio | 对象存储（证据/视频，持久卷 `miniodata`） | 9001 控制台 |
| migrate | 一次性 job：跑 21 表 schema 迁移 | - |
| server | NestJS 后端（健康检查 + 自动重试） | 8080 |
| web | React 前端 + nginx 反代（/api、/ws） | **8081** |

## 4. 验证（~2 分钟）

```bash
# 健康检查
curl http://localhost:8080/api/health
# → {"ok":true,"service":"verifyos-server",...}

# 打开控制台
open http://localhost:8081
# 右上角「重新运行」→ 应看到真实 Run 事件流 + 浏览器舞台截图
```

## 5. 日常运维

```bash
# 看日志
docker compose -f docker-compose.prod.yml logs -f server

# 升级（拉新代码后）
git pull && docker compose -f docker-compose.prod.yml up -d --build

# 备份（数据全在这两个卷）
docker run --rm -v verifyos_pgdata:/data -v $PWD:/backup alpine \
  tar czf /backup/pgdata-$(date +%F).tgz -C /data .
```

---

## 常见问题

| 现象 | 原因 | 处理 |
|---|---|---|
| server 反复重启 | PG 未就绪时迁移失败 | `docker compose -f docker-compose.prod.yml logs migrate`；PG healthy 后 `docker compose -f docker-compose.prod.yml up -d --force-recreate server` |
| 凭据解密报错 | `CREDENTIAL_ENCRYPTION_KEY` 与写入时不一致 | key 是唯一真源，找管理员要原 key |
| LLM 调用全部超时 | 出网代理/防火墙拦 `open.bigmodel.cn` | 容器内配 `HTTPS_PROXY` 或放行域名 |
| 舞台不显示截图 | 无已完成 Run | 先点「重新运行」跑一次 |

## 安全清单（生产必做）

- [ ] 修改 `POSTGRES_PASSWORD` / `MINIO_ROOT_PASSWORD`（勿用默认）
- [ ] `CREDENTIAL_ENCRYPTION_KEY` 离线备份（丢失 = 凭据全部不可解密）
- [ ] MinIO 控制台 9001 端口不对公网暴露
- [ ] LLM API Key 走公司网关代理，不直连公网
- [ ] 全部凭据经 VerifyOS 凭据体系存储（AES-256-GCM），禁止明文进环境变量

## 已知边界（当前版本）

- GitLab webhook 已就位（`POST /api/webhooks/gitlab`），真实 GitLab/CI 对接需配 token 与 preview URL 回传
- 概览页统计为内存聚合，跨重启统计待 PG 联调后落库
- RunRunner 的 LocatorCache 暂未命中（Stagehand act 未暴露 selector），不影响正确性
