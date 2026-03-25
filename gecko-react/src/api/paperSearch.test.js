import axios from 'axios';
import { searchPapers } from './paperSearch';

jest.mock('axios');

describe('paperSearch api', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('调用 /api/search 并返回数据', async () => {
    axios.get.mockReturnValue(
      Promise.resolve({
        data: {
          success: true,
          data: [
            {
              id: 'openalex:W1',
              title: 'Test',
              authors: ['A'],
              year: 2024,
              doi: '10.1000/x',
              journal: 'J',
              source: 'openalex'
            }
          ]
        }
      })
    );

    const result = await searchPapers('test keyword');

    expect(axios.get).toHaveBeenCalledWith('/api/search', {
      params: { keyword: 'test keyword' }
    });
    expect(result.success).toBe(true);
    expect(result.data[0].id).toBe('openalex:W1');
  });
});
