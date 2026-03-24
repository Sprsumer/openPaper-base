import axios from 'axios';

export const searchPapers = async keyword => {
  try {
    const res = await axios.get('/api/search', {
      params: { keyword }
    });
    return res.data;
  } catch (err) {
    const message =
      err && err.response && err.response.data && err.response.data.message
        ? err.response.data.message
        : '搜索接口调用失败';

    throw new Error(message);
  }
};
