-- VerifyOS 初始化：扩展 + 基础库（B1 数据模型在此扩展）
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 说明：正式 schema 由 apps/server 的 migration 管理（B1 工单），
-- 此文件只保证 compose 首次启动时扩展就绪。
