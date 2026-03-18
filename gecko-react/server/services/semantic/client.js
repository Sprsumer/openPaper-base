function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseRetryAfterMs(headerValue) {
  if (!headerValue) return null;

  const seconds = Number(headerValue);
  if (!Number.isNaN(seconds)) {
    return Math.max(0, seconds * 1000);
  }

  const retryDate = Date.parse(headerValue);
  if (Number.isNaN(retryDate)) {
    return null;
  }

  return Math.max(0, retryDate - Date.now());
}

function mapErrorMessage(status, kind) {
  if (kind === 'timeout') {
    return '上游响应超时，请稍后重试';
  }

  if (status === 429) {
    return '上游服务限流，已自动重试仍失败，请稍后再试';
  }

  if (status >= 500) {
    return '上游服务暂时不可用，请稍后重试';
  }

  return '语义服务请求失败';
}

async function requestSemantic(path, options) {
  const timeoutMs = Number(process.env.SEMANTIC_TIMEOUT_MS || 10000);
  const retryMax = Number(process.env.SEMANTIC_RETRY_MAX || 3);
  const retryBaseMs = Number(process.env.SEMANTIC_RETRY_BASE_MS || 400);
  const traceId = options.traceId;

  const headers = {
    Accept: 'application/json'
  };

  if (process.env.S2_API_KEY) {
    headers['x-api-key'] = process.env.S2_API_KEY;
  }

  const query = options.query || '';
  const url = `https://api.semanticscholar.org${path}${query}`;

  let attempt = 0;
  while (attempt <= retryMax) {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal: controller.signal
      });
      clearTimeout(timeoutHandle);

      if (response.ok) {
        const data = await response.json();
        return {
          ok: true,
          status: response.status,
          data,
          traceId
        };
      }

      const retriable = response.status === 429 || response.status >= 500;
      if (retriable && attempt < retryMax) {
        const retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'));
        const jitter = Math.floor(Math.random() * 100);
        const backoffMs =
          retryAfterMs !== null ? retryAfterMs : retryBaseMs * Math.pow(2, attempt) + jitter;
        console.warn(
          `[semantic-client] retrying status=${response.status} attempt=${attempt + 1} waitMs=${backoffMs} traceId=${traceId}`
        );
        await sleep(backoffMs);
        attempt += 1;
        continue;
      }

      return {
        ok: false,
        status: response.status,
        message: mapErrorMessage(response.status),
        traceId
      };
    } catch (error) {
      clearTimeout(timeoutHandle);

      const isTimeout = error && error.name === 'AbortError';
      const retriable = isTimeout || true;

      if (retriable && attempt < retryMax) {
        const jitter = Math.floor(Math.random() * 100);
        const backoffMs = retryBaseMs * Math.pow(2, attempt) + jitter;
        console.warn(
          `[semantic-client] retrying error=${isTimeout ? 'timeout' : 'network'} attempt=${attempt + 1} waitMs=${backoffMs} traceId=${traceId}`
        );
        await sleep(backoffMs);
        attempt += 1;
        continue;
      }

      return {
        ok: false,
        status: isTimeout ? 504 : 502,
        message: mapErrorMessage(isTimeout ? 504 : 502, isTimeout ? 'timeout' : 'network'),
        traceId
      };
    }
  }

  return {
    ok: false,
    status: 502,
    message: '语义服务请求失败',
    traceId
  };
}

module.exports = {
  requestSemantic
};
