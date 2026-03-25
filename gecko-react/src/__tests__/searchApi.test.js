const express = require('express');
const http = require('http');

jest.mock('../../server/services/search', () => {
  class SearchServiceError extends Error {
    constructor(message, status = 502) {
      super(message);
      this.status = status;
    }
  }

  return {
    runSearch: jest.fn(),
    SearchServiceError
  };
});

const { runSearch, SearchServiceError } = require('../../server/services/search');
const searchRouter = require('../../server/routes/search');

function requestJson(server, path) {
  const address = server.address();
  const urlPath = path;

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: address.port,
        path: urlPath,
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

describe('/api/search 接口', () => {
  let app;
  let server;

  beforeEach(done => {
    jest.clearAllMocks();
    app = express();
    app.use(searchRouter);
    server = app.listen(0, done);
  });

  afterEach(done => {
    server.close(done);
  });

  it('普通关键词返回 success:true', async () => {
    runSearch.mockReturnValue(
      Promise.resolve([
        {
          id: 'openalex:W1',
          title: 'Keyword Paper',
          authors: ['A'],
          year: 2022,
          doi: '10.1000/a',
          journal: 'J',
          source: 'openalex'
        }
      ])
    );

    const res = await requestJson(server, '/api/search?keyword=graph');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('DOI 查询返回精确结果结构', async () => {
    runSearch.mockReturnValue(
      Promise.resolve([
        {
          id: 'openalex:W2',
          title: 'DOI Paper',
          authors: ['B'],
          year: 2024,
          doi: '10.1000/doi',
          journal: 'Nature',
          source: 'openalex'
        }
      ])
    );

    const res = await requestJson(server, '/api/search?keyword=10.1000/doi');

    expect(res.status).toBe(200);
    expect(res.body.data[0]).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        title: expect.any(String),
        authors: expect.any(Array),
        year: expect.any(Number),
        doi: '10.1000/doi',
        source: expect.any(String)
      })
    );
  });

  it('上游异常时返回合理错误', async () => {
    runSearch.mockImplementation(
      () => Promise.reject(new SearchServiceError('上游搜索超时，请稍后重试', 504))
    );

    const res = await requestJson(server, '/api/search?keyword=timeout');

    expect(res.status).toBe(504);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('上游搜索超时');
  });

  it('keyword 缺失时返回 400', async () => {
    const res = await requestJson(server, '/api/search?keyword=');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});
