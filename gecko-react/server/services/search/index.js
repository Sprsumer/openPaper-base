const { URLSearchParams } = require('url');

const DEFAULT_TIMEOUT_MS = Number(process.env.SEARCH_TIMEOUT_MS || 10000);
const DEFAULT_LIMIT = Number(process.env.SEARCH_RESULT_LIMIT || 8);

class SearchServiceError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = 'SearchServiceError';
    this.status = status;
  }
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeTitle(title) {
  return normalizeText(title).replace(/[^a-z0-9\u4e00-\u9fa5\s]/gi, '');
}

function normalizeDoi(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  return raw
    .replace(/^https?:\/\/doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .trim()
    .toLowerCase();
}

function isDoiQuery(query) {
  const normalized = normalizeDoi(query);
  return /^10\.\d{4,9}\/.+/.test(normalized);
}

function parseOpenAlexId(idUrl) {
  const raw = String(idUrl || '');
  if (!raw) return '';

  const matched = raw.match(/openalex\.org\/(.+)$/i);
  return matched ? matched[1] : raw;
}

function mapOpenAlexWork(work) {
  const doi = normalizeDoi(work.doi || (work.ids && work.ids.doi));
  const openAlexId = parseOpenAlexId(work.id);

  return {
    id: openAlexId ? `openalex:${openAlexId}` : doi || normalizeTitle(work.title),
    title: work.title || '',
    authors:
      (work.authorships || [])
        .map(item => item && item.author && item.author.display_name)
        .filter(Boolean) || [],
    year: Number(work.publication_year || work.year) || null,
    doi,
    journal:
      (work.primary_location &&
        work.primary_location.source &&
        work.primary_location.source.display_name) ||
      (work.host_venue && work.host_venue.display_name) ||
      '',
    source: 'openalex',
    citationCount: Number(work.cited_by_count || 0) || 0
  };
}

function mapSemanticPaper(paper) {
  const doi = normalizeDoi(paper.doi || (paper.externalIds && paper.externalIds.DOI));
  const semanticId = paper.paperId || '';

  return {
    id: semanticId ? `semantic:${semanticId}` : doi || normalizeTitle(paper.title),
    title: paper.title || '',
    authors:
      (paper.authors || [])
        .map(item => (typeof item === 'string' ? item : item && item.name))
        .filter(Boolean) || [],
    year: Number(paper.year) || null,
    doi,
    journal: (paper.journal && paper.journal.name) || paper.venue || '',
    source: 'semantic',
    citationCount: Number(paper.citationCount || 0) || 0
  };
}

function tokenize(value) {
  return normalizeTitle(value)
    .split(' ')
    .map(token => token.trim())
    .filter(Boolean);
}

function getTokenOverlapScore(a, b) {
  const aSet = new Set(tokenize(a));
  const bSet = new Set(tokenize(b));
  if (!aSet.size || !bSet.size) return 0;

  let overlap = 0;
  aSet.forEach(token => {
    if (bSet.has(token)) {
      overlap += 1;
    }
  });

  return (overlap / Math.max(aSet.size, bSet.size)) * 100;
}

function dedupeResults(results) {
  const byDoi = new Set();
  const byId = new Set();
  const byTitle = new Set();
  const output = [];

  results.forEach(item => {
    const doiKey = normalizeDoi(item.doi);
    const idKey = normalizeText(item.id);
    const titleKey = normalizeTitle(item.title);

    if (doiKey && byDoi.has(doiKey)) return;
    if (idKey && byId.has(idKey)) return;
    if (titleKey && byTitle.has(titleKey)) return;

    if (doiKey) byDoi.add(doiKey);
    if (idKey) byId.add(idKey);
    if (titleKey) byTitle.add(titleKey);

    output.push(item);
  });

  return output;
}

function scorePaper(item, keyword) {
  const normalizedKeyword = normalizeText(keyword);
  const normalizedTitle = normalizeText(item.title);
  const queryDoi = normalizeDoi(keyword);
  const paperDoi = normalizeDoi(item.doi);
  const currentYear = new Date().getFullYear();

  let score = 0;

  if (queryDoi && paperDoi && queryDoi === paperDoi) {
    score += 1000;
  }

  if (normalizedKeyword && normalizedTitle === normalizedKeyword) {
    score += 500;
  }

  if (normalizedKeyword && normalizedTitle.includes(normalizedKeyword)) {
    score += 250;
  }

  score += getTokenOverlapScore(normalizedKeyword, normalizedTitle);

  const authorHit = (item.authors || []).some(author => normalizeText(author).includes(normalizedKeyword));
  if (authorHit) {
    score += 40;
  }

  if (item.year) {
    score += Math.max(0, 20 - Math.max(0, currentYear - item.year));
  }

  score += Math.min(10, (Number(item.citationCount || 0) || 0) / 100);

  return score;
}

function rankSearchResults(results, keyword) {
  return [...results]
    .map(item => ({
      ...item,
      _score: scorePaper(item, keyword)
    }))
    .sort((a, b) => {
      if (b._score !== a._score) {
        return b._score - a._score;
      }

      return (b.year || 0) - (a.year || 0);
    })
    .map(({ _score, ...rest }) => rest);
}

async function fetchJson(url, options = {}) {
  const timeoutMs = Number(options.timeoutMs || DEFAULT_TIMEOUT_MS);
  const hasAbortController = typeof AbortController !== 'undefined';
  const controller = hasAbortController ? new AbortController() : null;
  const timer = hasAbortController ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: options.headers || {},
      ...(controller ? { signal: controller.signal } : {})
    });

    if (!response.ok) {
      throw new SearchServiceError(`上游搜索服务错误：${response.status}`, response.status);
    }

    return await response.json();
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new SearchServiceError('上游搜索超时，请稍后重试', 504);
    }

    if (error instanceof SearchServiceError) {
      throw error;
    }

    throw new SearchServiceError('上游搜索请求失败', 502);
  } finally {
    clearTimeout(timer);
  }
}

async function searchOpenAlex(keyword, options = {}) {
  const limit = Number(options.limit || DEFAULT_LIMIT);
  const params = new URLSearchParams();

  params.set('per-page', String(limit));
  params.set('select', 'id,title,authorships,publication_year,doi,ids,primary_location,cited_by_count');

  if (isDoiQuery(keyword)) {
    params.set('filter', `doi:${normalizeDoi(keyword)}`);
  } else {
    params.set('search', keyword);
  }

  const data = await fetchJson(`https://api.openalex.org/works?${params.toString()}`, {
    timeoutMs: options.timeoutMs
  });

  const works = Array.isArray(data.results) ? data.results : [];
  return works.map(mapOpenAlexWork).filter(item => item.title);
}

async function searchSemantic(keyword, options = {}) {
  const limit = Number(options.limit || DEFAULT_LIMIT);
  const params = new URLSearchParams();

  params.set('query', keyword);
  params.set('limit', String(limit));
  params.set('fields', 'paperId,title,authors,year,doi,externalIds,journal,venue,citationCount');

  const apiKey = process.env.SEMANTIC_SCHOLAR_API_KEY || process.env.S2_API_KEY || '';
  const headers = {
    Accept: 'application/json'
  };

  if (apiKey) {
    headers['x-api-key'] = apiKey;
  }

  const data = await fetchJson(
    `https://api.semanticscholar.org/graph/v1/paper/search?${params.toString()}`,
    {
      timeoutMs: options.timeoutMs,
      headers
    }
  );

  const papers = Array.isArray(data.data) ? data.data : [];
  return papers.map(mapSemanticPaper).filter(item => item.title);
}

function normalizeLimit(limit) {
  const parsed = Number(limit || DEFAULT_LIMIT);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(20, Math.floor(parsed)));
}

async function runSearch(keyword, options = {}) {
  const query = String(keyword || '').trim();
  if (!query) return [];

  const limit = normalizeLimit(options.limit || process.env.SEARCH_RESULT_LIMIT);
  const provider = String(process.env.SEARCH_PROVIDER || 'openalex').toLowerCase();

  let combined = [];

  if (provider === 'semantic') {
    try {
      combined = await searchSemantic(query, { limit });
    } catch (semanticError) {
      combined = await searchOpenAlex(query, { limit });
    }
  } else if (provider === 'hybrid') {
    const [semanticResult, openAlexResult] = await Promise.allSettled([
      searchSemantic(query, { limit }),
      searchOpenAlex(query, { limit })
    ]);

    if (semanticResult.status === 'fulfilled') {
      combined = combined.concat(semanticResult.value);
    }

    if (openAlexResult.status === 'fulfilled') {
      combined = combined.concat(openAlexResult.value);
    }

    if (!combined.length) {
      const reason =
        (semanticResult.status === 'rejected' && semanticResult.reason) ||
        (openAlexResult.status === 'rejected' && openAlexResult.reason);
      throw reason instanceof Error
        ? reason
        : new SearchServiceError('搜索服务暂时不可用', 502);
    }
  } else {
    combined = await searchOpenAlex(query, { limit });
  }

  const deduped = dedupeResults(combined);
  const ranked = rankSearchResults(deduped, query);

  return ranked.slice(0, limit);
}

module.exports = {
  SearchServiceError,
  isDoiQuery,
  normalizeDoi,
  mapOpenAlexWork,
  mapSemanticPaper,
  dedupeResults,
  scorePaper,
  rankSearchResults,
  searchOpenAlex,
  searchSemantic,
  runSearch
};
