const store = new Map();
const inflight = new Map();

function buildKey(endpoint, params) {
  const entries = Object.keys(params || {})
    .sort()
    .map(key => [key, params[key]]);
  const query = entries
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
  return `${endpoint}?${query}`;
}

function get(key) {
  const item = store.get(key);
  if (!item) return null;

  if (item.expiresAt <= Date.now()) {
    store.delete(key);
    return null;
  }

  return item.value;
}

function set(key, value, ttlMs) {
  store.set(key, {
    value,
    expiresAt: Date.now() + ttlMs
  });
}

function getInflight(key) {
  return inflight.get(key);
}

function setInflight(key, promise) {
  inflight.set(key, promise);
}

function clearInflight(key) {
  inflight.delete(key);
}

module.exports = {
  buildKey,
  get,
  set,
  getInflight,
  setInflight,
  clearInflight
};
