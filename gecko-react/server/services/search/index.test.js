const {
  SearchServiceError,
  isDoiQuery,
  normalizeDoi,
  buildOpenAlexSearchUrl,
  fetchJson,
  mapOpenAlexWork,
  mapSemanticPaper,
  dedupeResults,
  scorePaper,
  rankSearchResults,
  searchOpenAlex,
  runSearch
} = require('./index');

describe('server/services/search/index', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env = { ...originalEnv };
    Object.defineProperty(global, 'fetch', {
      writable: true,
      configurable: true,
      value: jest.fn()
    });
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('识别 DOI 查询', () => {
    expect(isDoiQuery('10.1038/s41586-023-12345-6')).toBe(true);
    expect(isDoiQuery('https://doi.org/10.1038/s41586-023-12345-6')).toBe(true);
    expect(isDoiQuery('graph neural network')).toBe(false);
  });

  it('buildOpenAlexSearchUrl 普通关键词包含 search/per-page/select', () => {
    const url = buildOpenAlexSearchUrl('航空航天', 12);

    expect(url).toContain('https://api.openalex.org/works?');
    expect(url).toContain('per-page=12');
    expect(url).toContain(
      'select=id%2Ctitle%2Cauthorships%2Cpublication_year%2Cdoi%2Cids%2Cprimary_location%2Ccited_by_count'
    );
    expect(url).toContain('search=');
    expect(decodeURIComponent(url)).toContain('search=航空航天');
  });

  it('buildOpenAlexSearchUrl DOI 查询使用 filter=doi', () => {
    const url = buildOpenAlexSearchUrl('https://doi.org/10.1000/abc.DEF', 8);

    expect(url).toContain('filter=doi%3A10.1000%2Fabc.def');
    expect(url).not.toContain('search=');
  });

  it('mapOpenAlexWork 映射统一字段与 publication_year', () => {
    const mapped = mapOpenAlexWork({
      id: 'https://openalex.org/W123456',
      title: 'OpenAlex Paper',
      authorships: [{ author: { display_name: 'Alice' } }, { author: { display_name: 'Bob' } }],
      publication_year: 2024,
      ids: { doi: 'https://doi.org/10.1000/openalex.1' },
      primary_location: { source: { display_name: 'Nature' } },
      cited_by_count: 22
    });

    expect(mapped).toEqual({
      id: 'openalex:W123456',
      title: 'OpenAlex Paper',
      authors: ['Alice', 'Bob'],
      year: 2024,
      doi: '10.1000/openalex.1',
      journal: 'Nature',
      source: 'openalex',
      citationCount: 22
    });
  });

  it('mapOpenAlexWork 缺字段容错：primary_location/authorships 缺失不崩溃', () => {
    const mapped = mapOpenAlexWork({
      id: 'https://openalex.org/W2',
      title: 'No location paper',
      publication_year: 2020,
      cited_by_count: 0
    });

    expect(mapped.authors).toEqual([]);
    expect(mapped.journal).toBe('');
    expect(mapped.source).toBe('openalex');
  });

  it('mapSemanticPaper 映射统一字段', () => {
    const mapped = mapSemanticPaper({
      paperId: 'S-1',
      title: 'Semantic Paper',
      authors: [{ name: 'Carol' }, { name: 'Dave' }],
      year: 2021,
      externalIds: { DOI: '10.1000/semantic.1' },
      journal: { name: 'Science' },
      citationCount: 30
    });

    expect(mapped).toEqual({
      id: 'semantic:S-1',
      title: 'Semantic Paper',
      authors: ['Carol', 'Dave'],
      year: 2021,
      doi: '10.1000/semantic.1',
      journal: 'Science',
      source: 'semantic',
      citationCount: 30
    });
  });

  it('dedupeResults 按 DOI/id/标题归一化去重', () => {
    const deduped = dedupeResults([
      { id: 'openalex:1', title: 'Graph Neural Networks!', doi: '10.1000/dup', source: 'openalex' },
      { id: 'semantic:2', title: 'Another title', doi: '10.1000/dup', source: 'semantic' },
      { id: 'openalex:1', title: 'Different title', doi: '', source: 'openalex' },
      { id: 'semantic:3', title: 'Graph neural networks', doi: '', source: 'semantic' }
    ]);

    expect(deduped).toHaveLength(1);
    expect(deduped[0].id).toBe('openalex:1');
  });

  it('score/rank：DOI 精确匹配优先于高引用', () => {
    const ranked = rankSearchResults(
      [
        {
          id: 'doi-hit',
          title: 'Old paper',
          authors: ['Ann'],
          year: 2010,
          doi: '10.1038/s41586-023-12345-6',
          citationCount: 1
        },
        {
          id: 'high-citation',
          title: 'Popular paper',
          authors: ['Bob'],
          year: 2025,
          doi: '10.1000/other',
          citationCount: 100000
        }
      ],
      '10.1038/s41586-023-12345-6'
    );

    expect(ranked[0].id).toBe('doi-hit');
  });

  it('scorePaper：作者命中和年份有加分', () => {
    const authorHitScore = scorePaper(
      { id: 'a', title: 'paper', authors: ['Alice Zhang'], year: 2020, citationCount: 0 },
      'alice'
    );
    const noAuthorHitScore = scorePaper(
      { id: 'b', title: 'paper', authors: ['Bob Li'], year: 2020, citationCount: 0 },
      'alice'
    );
    expect(authorHitScore).toBeGreaterThan(noAuthorHitScore);

    const currentYear = new Date().getFullYear();
    const recent = scorePaper(
      { id: 'r', title: 'same', authors: [], year: currentYear, citationCount: 0 },
      'same'
    );
    const old = scorePaper({ id: 'o', title: 'same', authors: [], year: 2000, citationCount: 0 }, 'same');
    expect(recent).toBeGreaterThan(old);
  });

  it('searchOpenAlex 使用统一 builder 生成 URL', async () => {
    global.fetch.mockImplementation(() => Promise.resolve({ ok: true, json: async () => ({ results: [] }) }));

    await searchOpenAlex('graph neural network', { limit: 5 });

    const calledUrl = String(global.fetch.mock.calls[0][0]);
    expect(calledUrl).toBe(buildOpenAlexSearchUrl('graph neural network', 5));
  });

  it('runSearch 默认 openalex 时 URL 不包含旧 year select 片段', async () => {
    process.env.SEARCH_PROVIDER = 'openalex';
    global.fetch.mockImplementation(() => Promise.resolve({ ok: true, json: async () => ({ results: [] }) }));

    await runSearch('graph neural network', { limit: 5 });

    const url = String(global.fetch.mock.calls[0][0]);
    expect(url).toContain('publication_year');
    expect(url).not.toContain('publication_year%2Cyear%2C');
  });

  it('fetchJson：上游 400 转换为 SearchServiceError 并记录日志', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    global.fetch.mockImplementation(() =>
      Promise.resolve({ ok: false, status: 400, text: async () => '{"error":"bad request"}' })
    );

    await expect(fetchJson('https://api.openalex.org/works?search=test', { provider: 'openalex' })).rejects.toMatchObject({
      name: 'SearchServiceError',
      status: 400
    });
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  it('fetchJson：network error 转换为 SearchServiceError 502', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    global.fetch.mockImplementation(() => Promise.reject(new Error('network down')));

    await expect(fetchJson('https://api.openalex.org/works?search=test', { provider: 'openalex' })).rejects.toMatchObject({
      name: 'SearchServiceError',
      status: 502,
      message: '搜索服务请求失败：network down'
    });

    errorSpy.mockRestore();
  });

  it('fetchJson：AbortError 转换为 SearchServiceError 504', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    global.fetch.mockImplementation(() => Promise.reject(abortError));

    await expect(fetchJson('https://api.openalex.org/works?search=test', { provider: 'openalex' })).rejects.toMatchObject({
      name: 'SearchServiceError',
      status: 504,
      message: '上游搜索服务超时'
    });

    errorSpy.mockRestore();
  });

  it('provider 返回空结果时逻辑稳定', async () => {
    process.env.SEARCH_PROVIDER = 'openalex';
    global.fetch.mockImplementation(() => Promise.resolve({ ok: true, json: async () => ({ results: [] }) }));

    await expect(runSearch('empty', { limit: 5 })).resolves.toEqual([]);
  });

  it('normalizeDoi 支持 DOI URL 标准化', () => {
    expect(normalizeDoi('https://doi.org/10.1000/ABC')).toBe('10.1000/abc');
  });
});
