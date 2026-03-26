const {
  SearchServiceError,
  isDoiQuery,
  mapOpenAlexWork,
  mapSemanticPaper,
  dedupeResults,
  scorePaper,
  rankSearchResults,
  runSearch
} = require('../../server/services/search');

describe('server/services/search', () => {
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

  describe('A1 DOI 识别', () => {
    it('能识别标准 DOI', () => {
      expect(isDoiQuery('10.1038/s41586-023-12345-6')).toBe(true);
    });

    it('能识别 DOI URL', () => {
      expect(isDoiQuery('https://doi.org/10.1038/s41586-023-12345-6')).toBe(true);
    });

    it('普通关键词不会被识别为 DOI', () => {
      expect(isDoiQuery('graph neural network')).toBe(false);
    });
  });

  describe('A2 OpenAlex 映射', () => {
    it('mapOpenAlexWork 映射统一字段', () => {
      const mapped = mapOpenAlexWork({
        id: 'https://openalex.org/W123456',
        title: 'A Unified Search Paper',
        authorships: [{ author: { display_name: 'Alice' } }, { author: { display_name: 'Bob' } }],
        publication_year: 2024,
        ids: { doi: 'https://doi.org/10.1000/openalex.1' },
        primary_location: { source: { display_name: 'Nature' } },
        cited_by_count: 135
      });

      expect(mapped).toEqual({
        id: 'openalex:W123456',
        title: 'A Unified Search Paper',
        authors: ['Alice', 'Bob'],
        year: 2024,
        doi: '10.1000/openalex.1',
        journal: 'Nature',
        source: 'openalex',
        citationCount: 135
      });
    });
  });

  describe('A3 Semantic 映射', () => {
    it('mapSemanticPaper 映射统一字段', () => {
      const mapped = mapSemanticPaper({
        paperId: 'abc123',
        title: 'Semantic Search Result',
        authors: [{ name: 'Carol' }, { name: 'Dave' }],
        year: 2021,
        externalIds: { DOI: '10.1000/semantic.1' },
        journal: { name: 'Science' },
        citationCount: 42
      });

      expect(mapped).toEqual({
        id: 'semantic:abc123',
        title: 'Semantic Search Result',
        authors: ['Carol', 'Dave'],
        year: 2021,
        doi: '10.1000/semantic.1',
        journal: 'Science',
        source: 'semantic',
        citationCount: 42
      });
    });

    it('字段缺失时不崩溃', () => {
      expect(() => mapSemanticPaper({ title: 'Only Title' })).not.toThrow();
      expect(mapSemanticPaper({ title: 'Only Title' })).toEqual(
        expect.objectContaining({
          title: 'Only Title',
          authors: [],
          source: 'semantic'
        })
      );
    });
  });

  describe('A4 去重逻辑', () => {
    it('按 DOI / id / 归一化标题去重，并跨来源保留单条', () => {
      const list = [
        {
          id: 'openalex:W1',
          title: 'Graph Neural Networks!',
          doi: '10.1000/dup.doi',
          source: 'openalex'
        },
        {
          id: 'semantic:S1',
          title: 'Another title',
          doi: '10.1000/dup.doi',
          source: 'semantic'
        },
        {
          id: 'openalex:W1',
          title: 'Different title',
          doi: '',
          source: 'openalex'
        },
        {
          id: 'semantic:S2',
          title: 'Graph neural networks',
          doi: '',
          source: 'semantic'
        }
      ];

      const deduped = dedupeResults(list);
      expect(deduped).toHaveLength(1);
      expect(deduped[0]).toEqual(expect.objectContaining({ id: 'openalex:W1' }));
    });

    it('空数组输入返回空数组', () => {
      expect(dedupeResults([])).toEqual([]);
    });
  });

  describe('A5 排序逻辑', () => {
    it('DOI 精确匹配优先，且不能被 citationCount 反超', () => {
      const ranked = rankSearchResults(
        [
          {
            id: 'p-doi',
            title: 'Some old paper',
            authors: ['Ann'],
            year: 2010,
            doi: '10.1038/s41586-023-12345-6',
            citationCount: 1
          },
          {
            id: 'p-cited',
            title: 'Very popular paper',
            authors: ['Ben'],
            year: 2025,
            doi: '10.1000/another',
            citationCount: 50000
          }
        ],
        '10.1038/s41586-023-12345-6'
      );

      expect(ranked[0].id).toBe('p-doi');
    });

    it('标题精确匹配优先于普通包含命中', () => {
      const ranked = rankSearchResults(
        [
          {
            id: 'exact',
            title: 'graph neural network',
            authors: [],
            year: 2020,
            citationCount: 0
          },
          {
            id: 'contains',
            title: 'applications of graph neural network in chemistry',
            authors: [],
            year: 2020,
            citationCount: 0
          }
        ],
        'graph neural network'
      );

      expect(ranked[0].id).toBe('exact');
    });

    it('作者命中会提升分数', () => {
      const withAuthorHit = scorePaper(
        {
          id: 'a',
          title: 'paper one',
          authors: ['Alice Zhang'],
          year: 2020,
          citationCount: 0
        },
        'alice'
      );

      const withoutAuthorHit = scorePaper(
        {
          id: 'b',
          title: 'paper one',
          authors: ['Bob Li'],
          year: 2020,
          citationCount: 0
        },
        'alice'
      );

      expect(withAuthorHit).toBeGreaterThan(withoutAuthorHit);
    });

    it('更新年份有轻微加成', () => {
      const recent = scorePaper(
        {
          id: 'recent',
          title: 'same title',
          authors: [],
          year: new Date().getFullYear(),
          citationCount: 0
        },
        'same title'
      );

      const old = scorePaper(
        {
          id: 'old',
          title: 'same title',
          authors: [],
          year: 1990,
          citationCount: 0
        },
        'same title'
      );

      expect(recent).toBeGreaterThan(old);
    });
  });

  describe('A6 空结果与异常兜底', () => {
    it('openalex 返回空结果时 runSearch 返回空数组', async () => {
      process.env.SEARCH_PROVIDER = 'openalex';
      global.fetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({ results: [] })
        })
      );

      await expect(runSearch('quantum', { limit: 5 })).resolves.toEqual([]);
    });

    it('provider 不可用时返回可解释错误', async () => {
      process.env.SEARCH_PROVIDER = 'openalex';
      global.fetch.mockImplementation(() => Promise.resolve({ ok: false, status: 503 }));

      await expect(runSearch('unstable provider')).rejects.toBeInstanceOf(SearchServiceError);
    });

    it('semantic 失败时可降级到 openalex', async () => {
      process.env.SEARCH_PROVIDER = 'semantic';

      global.fetch
        .mockImplementationOnce(() => Promise.resolve({ ok: false, status: 503 }))
        .mockImplementationOnce(() =>
          Promise.resolve({
            ok: true,
            json: async () => ({
              results: [
                {
                  id: 'https://openalex.org/W42',
                  title: 'Fallback from OpenAlex',
                  authorships: [],
                  publication_year: 2022,
                  doi: '10.1000/fallback.1'
                }
              ]
            })
          })
        );

      const result = await runSearch('fallback', { limit: 5 });
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(expect.objectContaining({ source: 'openalex' }));
    });

    it('没有 semantic key 且 provider=openalex 时可正常工作', async () => {
      process.env.SEARCH_PROVIDER = 'openalex';
      delete process.env.SEMANTIC_SCHOLAR_API_KEY;
      delete process.env.S2_API_KEY;

      global.fetch.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            results: [
              {
                id: 'https://openalex.org/W99',
                title: 'No key still works',
                authorships: [],
                publication_year: 2024,
                doi: '10.1000/no-key'
              }
            ]
          })
        })
      );

      const result = await runSearch('no key', { limit: 5 });
      expect(result).toHaveLength(1);
      expect(result[0].source).toBe('openalex');
    });
  });
});
