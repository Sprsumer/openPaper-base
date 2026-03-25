const {
  isDoiQuery,
  mapOpenAlexWork,
  dedupeResults,
  rankSearchResults,
  runSearch,
  SearchServiceError
} = require('../../server/services/search');

describe('unified search service', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env = { ...originalEnv };
    global.fetch = jest.fn();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('识别 DOI 查询', () => {
    expect(isDoiQuery('10.1038/s41586-020-2649-2')).toBe(true);
    expect(isDoiQuery('https://doi.org/10.1000/xyz123')).toBe(true);
    expect(isDoiQuery('deep learning paper')).toBe(false);
  });

  it('正确映射 OpenAlex 响应', () => {
    const mapped = mapOpenAlexWork({
      id: 'https://openalex.org/W123456',
      title: 'Test Paper',
      authorships: [{ author: { display_name: 'Alice' } }, { author: { display_name: 'Bob' } }],
      publication_year: 2024,
      ids: { doi: 'https://doi.org/10.1000/xyz123' },
      primary_location: { source: { display_name: 'Nature' } },
      cited_by_count: 100
    });

    expect(mapped).toEqual(
      expect.objectContaining({
        id: 'openalex:W123456',
        title: 'Test Paper',
        authors: ['Alice', 'Bob'],
        year: 2024,
        doi: '10.1000/xyz123',
        journal: 'Nature',
        source: 'openalex'
      })
    );
  });

  it('按 DOI / ID / 标题去重', () => {
    const deduped = dedupeResults([
      { id: 'openalex:1', title: 'A Paper', doi: '10.1000/abc', authors: [] },
      { id: 'semantic:2', title: 'Another', doi: '10.1000/abc', authors: [] },
      { id: 'openalex:1', title: 'Different', doi: '', authors: [] },
      { id: 'semantic:3', title: 'A Paper', doi: '', authors: [] }
    ]);

    expect(deduped).toHaveLength(1);
    expect(deduped[0].id).toBe('openalex:1');
  });

  it('排序优先 DOI 精确匹配与标题相关性', () => {
    const ranked = rankSearchResults(
      [
        {
          id: 'p1',
          title: 'Graph Neural Networks',
          authors: ['Alice'],
          year: 2021,
          doi: '10.1000/target',
          citationCount: 5
        },
        {
          id: 'p2',
          title: 'Graph Neural Networks in Biology',
          authors: ['Bob'],
          year: 2024,
          doi: '10.1000/other',
          citationCount: 500
        }
      ],
      '10.1000/target'
    );

    expect(ranked[0].id).toBe('p1');
  });

  it('空结果返回空数组，不抛异常', async () => {
    process.env.SEARCH_PROVIDER = 'openalex';
    global.fetch.mockReturnValue(
      Promise.resolve({
        ok: true,
        json: async () => ({ results: [] })
      })
    );

    await expect(runSearch('quantum', { limit: 5 })).resolves.toEqual([]);
  });

  it('semantic provider 在上游失败时回退 openalex（无 key 仍可运行）', async () => {
    process.env.SEARCH_PROVIDER = 'semantic';
    delete process.env.SEMANTIC_SCHOLAR_API_KEY;
    delete process.env.S2_API_KEY;

    global.fetch
      .mockImplementationOnce(() => Promise.resolve({ ok: false, status: 503 }))
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            results: [
              {
                id: 'https://openalex.org/W1',
                title: 'Fallback Paper',
                authorships: [],
                publication_year: 2022,
                doi: '10.1000/fallback'
              }
            ]
          })
        })
      );

    const data = await runSearch('fallback test', { limit: 5 });
    expect(data).toHaveLength(1);
    expect(data[0].source).toBe('openalex');
  });

  it('上游超时时抛出 SearchServiceError', async () => {
    process.env.SEARCH_PROVIDER = 'openalex';
    global.fetch.mockImplementation(() => Promise.reject({ name: 'AbortError' }));

    await expect(runSearch('timeout case', { limit: 5 })).rejects.toBeInstanceOf(SearchServiceError);
  });
});
