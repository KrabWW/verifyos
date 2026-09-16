-- J02 Coverage 复活：graph_node 补 created_at（overview.controller.ts G04 依赖该列做快照趋势）
-- 回填语义（诚实标注）：
--   · 节点 meta 无 firstSeen；优先取 meta->>'explorationId' 对应 exploration.created_at（首次探索时间，最接近首次发现）；
--   · 无 exploration 关联时回退 meta->>'lastSeenAt'（最后观测时间，upsert 会刷新，偏新但真实）；
--   · 都没有时 now()。新数据由 DEFAULT now() 保证。
ALTER TABLE graph_node ADD COLUMN IF NOT EXISTS created_at timestamptz;

UPDATE graph_node SET created_at = COALESCE(
  (SELECT e.created_at FROM exploration e WHERE e.id::text = graph_node.meta->>'explorationId' LIMIT 1),
  NULLIF(graph_node.meta->>'lastSeenAt', '')::timestamptz,
  now()
)
WHERE created_at IS NULL;

ALTER TABLE graph_node ALTER COLUMN created_at SET DEFAULT now();
