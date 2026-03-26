const express = require('express');
const http = require('http');

const searchRouter = require('../../server/routes/search');

function requestJson(server, path) {
  const address = server.address();

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: address.port,
        path,
        method: 'GET'
      },
      res => {
        let body = '';
        res.on('data', chunk => {
          body += chunk;
        });
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            body: body ? JSON.parse(body) : {}
          });
        });
      }
    );

    req.on('error', reject);
    req.end();
  });
}

describe('/api/search route integration', () => {
  const originalEnv = process.env;
  let app;
  let server;

  beforeEach(done => {
    process.env = { ...originalEnv };
    Object.defineProperty(global, 'fetch', {
      writable: true,
      configurable: true,
      value: jest.fn()
    });

    app = express();
    app.use(searchRouter);
    server = app.listen(0, done);
  });

  afterEach(done => {
    server.close(done);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('B1 普通关键词搜索返回 200/success/data[]/必要字段', async () => {
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
              doi: '10.1000/gnn.1'
            }
          ]
        })
      })
    );

    const res = await requestJson(server, '/api/search?keyword=graph%20neural%20network');

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

  it('B2 DOI 搜索时 DOI 精确匹配项排序靠前', async () => {
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

    const res = await requestJson(server, '/api/search?keyword=10.1038/s41586-023-12345-6');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data[0].doi).toBe('10.1038/s41586-023-12345-6');
  });

  it('B3 semantic 失败时可降级到 OpenAlex', async () => {
    process.env.SEARCH_PROVIDER = 'semantic';

    global.fetch
      .mockImplementationOnce(() => Promise.resolve({ ok: false, status: 503 }))
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            results: [
              {
                id: 'https://openalex.org/W300',
                title: 'OpenAlex fallback paper',
                authorships: [],
                publication_year: 2022,
                doi: '10.1000/fallback.route'
              }
            ]
          })
        })
      );

    const res = await requestJson(server, '/api/search?keyword=fallback%20test');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data[0].source).toBe('openalex');
  });

  it('B4 无 SEMANTIC_SCHOLAR_API_KEY 且 openalex 模式可运行', async () => {
    process.env.SEARCH_PROVIDER = 'openalex';
    delete process.env.SEMANTIC_SCHOLAR_API_KEY;
    delete process.env.S2_API_KEY;

    global.fetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({
          results: [
            {
              id: 'https://openalex.org/W400',
              title: 'OpenAlex without key',
              authorships: [],
              publication_year: 2024,
              doi: '10.1000/openalex.only'
            }
          ]
        })
      })
    );

    const res = await requestJson(server, '/api/search?keyword=openalex');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
  });

  it('B5 参数校验：缺 keyword / 空 keyword 返回 400', async () => {
    const missing = await requestJson(server, '/api/search');
    const empty = await requestJson(server, '/api/search?keyword=%20%20%20');

    expect(missing.status).toBe(400);
    expect(missing.body.success).toBe(false);
    expect(empty.status).toBe(400);
    expect(empty.body.success).toBe(false);
  });

  it('B5 参数校验：limit 非法值会被规范化（兜底为默认 8）', async () => {
    process.env.SEARCH_PROVIDER = 'openalex';

    global.fetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ results: [] })
      })
    );

    const res = await requestJson(server, '/api/search?keyword=graph&limit=invalid');

    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalled();
    const calledUrl = global.fetch.mock.calls[0][0];
    expect(String(calledUrl)).toContain('per-page=8');
  });
});
