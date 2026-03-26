const { searchPapers } = require('./searchController');

function createRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

describe('server/controllers/searchController', () => {
  const originalEnv = process.env;

  beforeEach(() => {
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

  it('4.1 正常关键词搜索返回 200 + success + data[] + 必要字段', async () => {
    process.env.SEARCH_PROVIDER = 'openalex';
    global.fetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({
          results: [
            {
              id: 'https://openalex.org/W1',
              title: 'Graph Neural Network Survey',
              authorships: [{ author: { display_name: 'Alice' } }],
              publication_year: 2023,
              doi: '10.1000/gnn.1'
            }
          ]
        })
      })
    );

    const req = { query: { keyword: 'graph neural network', limit: '8' } };
    const res = createRes();

    await searchPapers(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data[0]).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        title: expect.any(String),
        authors: expect.any(Array),
        year: expect.any(Number),
        source: expect.any(String)
      })
    );
  });

  it('4.2 DOI 搜索时返回结构正常且 DOI 精确匹配靠前', async () => {
    process.env.SEARCH_PROVIDER = 'openalex';
    global.fetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({
          results: [
            {
              id: 'https://openalex.org/W200',
              title: 'A very cited paper',
              authorships: [{ author: { display_name: 'Tom' } }],
              publication_year: 2025,
              doi: '10.1000/not-target',
              cited_by_count: 90000
            },
            {
              id: 'https://openalex.org/W201',
              title: 'Target DOI paper',
              authorships: [{ author: { display_name: 'Jerry' } }],
              publication_year: 2018,
              doi: '10.1038/s41586-023-12345-6',
              cited_by_count: 1
            }
          ]
        })
      })
    );

    const req = { query: { keyword: '10.1038/s41586-023-12345-6' } };
    const res = createRes();

    await searchPapers(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data[0].doi).toBe('10.1038/s41586-023-12345-6');
  });

  it('4.3 参数校验：缺 keyword 返回 400', async () => {
    const req = { query: {} };
    const res = createRes();

    await searchPapers(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('4.3 参数校验：空 keyword 返回 400', async () => {
    const req = { query: { keyword: '   ' } };
    const res = createRes();

    await searchPapers(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('4.3 参数校验：非法 limit 会被规范化兜底', async () => {
    process.env.SEARCH_PROVIDER = 'openalex';
    global.fetch.mockImplementation(() => Promise.resolve({ ok: true, json: async () => ({ results: [] }) }));

    const req = { query: { keyword: 'graph', limit: 'invalid' } };
    const res = createRes();

    await searchPapers(req, res);

    expect(res.statusCode).toBe(200);
    expect(global.fetch).toHaveBeenCalled();
    const calledUrl = String(global.fetch.mock.calls[0][0]);
    expect(calledUrl).toContain('per-page=8');
  });

  it('4.4 上游失败时返回可解释错误结构，不 crash', async () => {
    process.env.SEARCH_PROVIDER = 'openalex';
    global.fetch.mockImplementation(() => Promise.resolve({ ok: false, status: 400 }));

    const req = { query: { keyword: 'graph' } };
    const res = createRes();

    await searchPapers(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('搜索异常：上游搜索服务错误：400');
  });
});
