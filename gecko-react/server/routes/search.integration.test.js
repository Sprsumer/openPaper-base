const request = require('supertest');

const app = require('../app');

describe('/api/search route integration', () => {
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

  it('正常关键词搜索返回 200/success/data[]/必要字段', async () => {
    process.env.SEARCH_PROVIDER = 'openalex';
    global.fetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({
          results: [
            {
              id: 'https://openalex.org/W101',
              title: 'Graph Neural Network Survey',
              authorships: [{ author: { display_name: 'Alice' } }],
              publication_year: 2023,
              doi: '10.1000/gnn.1',
              cited_by_count: 2
            }
          ]
        })
      })
    );

    const res = await request(app).get('/api/search').query({ keyword: '航空航天' });

    expect(res.status).toBe(200);
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

  it('空 keyword 返回 400', async () => {
    const res = await request(app).get('/api/search').query({ keyword: '' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('关键词不能为空');
  });

  it('缺少 keyword 返回 400', async () => {
    const res = await request(app).get('/api/search');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('上游 400 时返回错误结构且不 crash', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    process.env.SEARCH_PROVIDER = 'openalex';
    global.fetch.mockImplementation(() =>
      Promise.resolve({
        ok: false,
        status: 400,
        text: async () => '{"error":"bad request"}'
      })
    );

    const res = await request(app).get('/api/search').query({ keyword: '航空航天' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('上游搜索服务错误：400');
    errorSpy.mockRestore();
  });

  it('openalex 模式下请求 OpenAlex works API 且含 search/filter 参数', async () => {
    process.env.SEARCH_PROVIDER = 'openalex';
    global.fetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ results: [] })
      })
    );

    await request(app).get('/api/search').query({ keyword: '航空航天' });

    const firstUrl = String(global.fetch.mock.calls[0][0]);
    expect(firstUrl).toContain('https://api.openalex.org/works');
    expect(firstUrl).toContain('search=');

    await request(app).get('/api/search').query({ keyword: '10.1000/abc' });
    const secondUrl = String(global.fetch.mock.calls[1][0]);
    expect(secondUrl).toContain('filter=doi%3A10.1000%2Fabc');
  });

  it('limit 规范化：超大值不会直接透传 9999', async () => {
    process.env.SEARCH_PROVIDER = 'openalex';
    global.fetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ results: [] })
      })
    );

    const res = await request(app).get('/api/search').query({ keyword: '航空航天', limit: '9999' });

    expect(res.status).toBe(200);
    const calledUrl = String(global.fetch.mock.calls[0][0]);
    expect(calledUrl).toContain('per-page=20');
    expect(calledUrl).not.toContain('per-page=9999');
  });
});
