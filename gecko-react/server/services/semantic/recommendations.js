const { requestSemantic } = require('./client');
const cache = require('./cache');

function makeTraceId() {
  return `semantic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

module.exports = async (req, res) => {
  const paperId = (req.query.paperId || '').trim();
  if (!paperId) {
    return res.status(400).json({ success: false, status: 400, message: '缺少参数 paperId' });
  }

  const ttlMs = Number(process.env.SEMANTIC_RECO_TTL_MS || 1800000);
  const traceId = makeTraceId();
  const key = cache.buildKey('citations-references', { paperId });

  const cached = cache.get(key);
  if (cached) {
    return res.json({ success: true, data: cached, meta: { cacheHit: true, traceId } });
  }

  const inflight = cache.getInflight(key);
  if (inflight) {
    const result = await inflight;
    return res.json(result.ok
      ? { success: true, data: result.data, meta: { cacheHit: false, traceId: result.traceId } }
      : { success: false, status: result.status, message: result.message, traceId: result.traceId });
  }

  const requestPromise = (async () => {
    // 并行请求 citations + references（官方仍在维护）
    const [citRes, refRes] = await Promise.all([
      requestSemantic(`/graph/v1/paper/${paperId}/citations?limit=8&fields=paperId,title,authors,year,doi`, { traceId: traceId + '-cit' }),
      requestSemantic(`/graph/v1/paper/${paperId}/references?limit=8&fields=paperId,title,authors,year,doi`, { traceId: traceId + '-ref' })
    ]);

    if (!citRes.ok && !refRes.ok) {
      return { ok: false, status: 502, message: '上游服务请求失败' };
    }

    // 合并成推荐论文格式（和原 recommendations 结构一致）
    const related = [
      ...(citRes.ok ? citRes.data.data || [] : []),
      ...(refRes.ok ? refRes.data.data || [] : [])
    ].slice(0, 15);

    const fakeRecData = { recommendedPapers: related };  // 保持前端兼容

    return { ok: true, data: fakeRecData };
  })();

  cache.setInflight(key, requestPromise);

  try {
    const result = await requestPromise;
    if (result.ok) {
      cache.set(key, result.data, ttlMs);
      return res.json({ success: true, data: result.data, meta: { cacheHit: false, traceId } });
    }
    return res.status(result.status).json({ success: false, status: result.status, message: result.message, traceId });
  } finally {
    cache.clearInflight(key);
  }
};
