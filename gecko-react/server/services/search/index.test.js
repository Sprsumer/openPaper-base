const {
  SearchServiceError,
  isDoiQuery,
  mapOpenAlexWork,
  mapSemanticPaper,
  dedupeResults,
  scorePaper,
  rankSearchResults,
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

  it('3.1 识别 DOI 查询', () => {
    expect(isDoiQuery('10.1038/s41586-023-12345-6')).toBe(true);
    expect(isDoiQuery('https://doi.org/10.1038/s41586-023-12345-6')).toBe(true);
    expect(isDoiQuery('graph neural network')).toBe(false);
  });

  it('3.2 mapOpenAlexWork 映射统一字段', () => {
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

  it('3.3 mapSemanticPaper 映射统一字段', () => {
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

  it('3.4 dedupeResults 按 DOI/id/标题归一化去重，跨来源仅保留一条', () => {
    const deduped = dedupeResults([
      { id: 'openalex:1', title: 'Graph Neural Networks!', doi: '10.1000/dup', source: 'openalex' },
      { id: 'semantic:2', title: 'Another title', doi: '10.1000/dup', source: 'semantic' },
      { id: 'openalex:1', title: 'Different title', doi: '', source: 'openalex' },
      { id: 'semantic:3', title: 'Graph neural networks', doi: '', source: 'semantic' }
    ]);

    expect(deduped).toHaveLength(1);
    expect(deduped[0].id).toBe('openalex:1');
  });

  it('3.5 DOI 精确匹配优先，且不被 citationCount 压过', () => {
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

  it('3.5 标题精确匹配高于包含，作者命中有加分，年份有轻微加分', () => {
    const ranked = rankSearchResults(
      [
        { id: 'exact', title: 'graph neural network', authors: ['alice'], year: 2022, citationCount: 0 },
        {
          id: 'contains',
          title: 'applications of graph neural network',
          authors: ['bob'],
          year: 2022,
          citationCount: 0
        }
      ],
      'graph neural network'
    );

    expect(ranked[0].id).toBe('exact');

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

  it('3.6 空数组与缺字段对象不崩溃', () => {
    expect(dedupeResults([])).toEqual([]);
    expect(() => mapOpenAlexWork({})).not.toThrow();
    expect(() => mapSemanticPaper({})).not.toThrow();
  });

  it('修复点：OpenAlex 默认查询参数不再包含非法 year select 字段', async () => {
    process.env.SEARCH_PROVIDER = 'openalex';
    global.fetch.mockImplementation(() => Promise.resolve({ ok: true, json: async () => ({ results: [] }) }));

    await runSearch('graph neural network', { limit: 5 });

    const url = String(global.fetch.mock.calls[0][0]);
    expect(url).toContain('select=id%2Ctitle%2Cauthorships%2Cpublication_year%2Cdoi%2Cids%2Cprimary_location%2Ccited_by_count');
    expect(url).not.toContain('publication_year%2Cyear%2C');
  });

  it('3.6 provider 返回空结果时逻辑稳定', async () => {
    process.env.SEARCH_PROVIDER = 'openalex';
    global.fetch.mockImplementation(() => Promise.resolve({ ok: true, json: async () => ({ results: [] }) }));

    await expect(runSearch('empty', { limit: 5 })).resolves.toEqual([]);
  });

  it('4.4 对应基础能力：provider 错误时返回可解释错误', async () => {
    process.env.SEARCH_PROVIDER = 'openalex';
    global.fetch.mockImplementation(() => Promise.resolve({ ok: false, status: 400 }));

    await expect(runSearch('bad request')).rejects.toBeInstanceOf(SearchServiceError);
  });
});
