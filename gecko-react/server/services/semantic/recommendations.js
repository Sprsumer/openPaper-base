const { requestSemantic } = require('./client');
const cache = require('./cache');

function makeTraceId() {
  return `semantic-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

module.exports = async (req, res) => {
  const paperId = (req.query.paperId || '').trim();

  if (!paperId) {
    return res.status(400).json({
      success: false,
      status: 400,
      message: '缺少参数 paperId'
    });
  }

  const ttlMs = Number(process.env.SEMANTIC_RECO_TTL_MS || 1800000);
  const endpoint = `/recommendations/v1/papers/forpaper/${encodeURIComponent(paperId)}`;
  const params = {
    fields: 'paperId,title,authors,year,doi,externalIds',
    limit: 15,
    paperId
  };
  const traceId = makeTraceId();
  const key = cache.buildKey('/recommendations/v1/papers/forpaper', params);

  const cached = cache.get(key);
  if (cached) {
    return res.json({
      success: true,
      data: cached,
      meta: {
        cacheHit: true,
        traceId
      }
    });
  }

  const inflight = cache.getInflight(key);
  if (inflight) {
    const result = await inflight;
    if (!result.ok) {
      return res.status(result.status).json({
        success: false,
        status: result.status,
        message: result.message,
        traceId: result.traceId
      });
    }

    return res.json({
      success: true,
      data: result.data,
      meta: {
        cacheHit: false,
        traceId: result.traceId
      }
    });
  }

  const query = '?limit=15&fields=paperId,title,authors,year,doi,externalIds';

  const requestPromise = requestSemantic(endpoint, {
    query,
    traceId
  });

  cache.setInflight(key, requestPromise);

  try {
    const result = await requestPromise;

    if (!result.ok) {
      return res.status(result.status).json({
        success: false,
        status: result.status,
        message: result.message,
        traceId: result.traceId
      });
    }

    cache.set(key, result.data, ttlMs);

    return res.json({
      success: true,
      data: result.data,
      meta: {
        cacheHit: false,
        traceId: result.traceId
      }
    });
  } finally {
    cache.clearInflight(key);
  }
};
