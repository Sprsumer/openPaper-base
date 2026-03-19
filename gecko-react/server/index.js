require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const session = require('express-session');
var cookieParser = require('cookie-parser');

function createSemanticRateLimiter() {
  const windowMs = 60 * 1000;
  const defaultLimit = Number(process.env.SEMANTIC_LOCAL_RATE_LIMIT_PER_MIN || 30);
  const buckets = new Map();

  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();
    const bucket = buckets.get(ip) || { count: 0, resetAt: now + windowMs };

    if (now > bucket.resetAt) {
      bucket.count = 0;
      bucket.resetAt = now + windowMs;
    }

    bucket.count += 1;
    buckets.set(ip, bucket);

    if (bucket.count > defaultLimit) {
      return res.status(429).json({
        success: false,
        status: 429,
        message: '本地请求过于频繁，请稍后再试'
      });
    }

    return next();
  };
}

const sessionOpts = {
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true
};

const app = express();

app.use(session(sessionOpts));
app.use(cookieParser());

app.use(express.static(path.join(path.dirname(__dirname), 'build')));

app.get('/', (req, res) => {
  res.sendFile(path.join(path.dirname(__dirname), 'build', 'index.html'));
});

app.get('/services/mendeley/authenticate', require('./services/mendeley/authenticate'));
app.get('/services/mendeley/verify', require('./services/mendeley/verify'));
app.get('/services/mendeley/getFolders', require('./services/mendeley/getFolders'));
app.get(
  '/services/mendeley/getDocumentsInFolder',
  require('./services/mendeley/getDocumentsInFolder')
);
app.get('/services/zotero/authenticate', require('./services/zotero/authenticate'));
app.get('/services/zotero/verify', require('./services/zotero/verify'));
app.get('/services/zotero/login', require('./services/zotero/login'));
app.get('/services/zotero/getCollections', require('./services/zotero/getCollections'));
app.get('/services/zotero/getItemsInCollection', require('./services/zotero/getItemsInCollection'));
app.post('/services/zotero/addItems', require('./services/zotero/addItems'));

const semanticRateLimiter = createSemanticRateLimiter();

app.get('/api/semantic/search', semanticRateLimiter, require('./services/semantic/search'));
app.get(
  '/api/semantic/recommendations',
  semanticRateLimiter,
  require('./services/semantic/recommendations')
);

// === 新增 OpenAlex proxy（解决浏览器直连问题）===
app.get('/api/openalex/search', semanticRateLimiter, async (req, res) => {
  try {
    const query = req.query.q || '';
    const url = `https://api.openalex.org/works?search=${encodeURIComponent(
      query
    )}&per-page=3&select=id,title,authorships,year,doi,ids`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`OpenAlex 返回 ${response.status}`);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/openalex/related', semanticRateLimiter, async (req, res) => {
  try {
    const titleKeywords = req.query.keywords || '';
    const url = `https://api.openalex.org/works?search=${encodeURIComponent(
      titleKeywords
    )}&per-page=15&select=id,title,authorships,year,doi,ids&filter=publication_year:>2015`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`OpenAlex 返回 ${response.status}`);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => console.log(`CitationGecko server listening on...${PORT}`));
