const axios = require('axios');

module.exports = async (req, res) => {
  const paperId = (req.query.paperId || '').trim();

  if (!paperId) {
    return res.status(400).json({
      success: false,
      message: '缺少参数 paperId'
    });
  }

  try {
    const response = await axios.get(
      `https://api.semanticscholar.org/recommendations/v1/papers/forpaper/${encodeURIComponent(
        paperId
      )}`,
      {
        params: {
          limit: 15,
          fields: 'paperId,title,authors,year,doi,externalIds'
        },
        timeout: 12000
      }
    );

    return res.json({
      success: true,
      data: response.data
    });
  } catch (error) {
    const status = error.response ? error.response.status : 502;

    if (status === 429) {
      return res.status(429).json({
        success: false,
        message: 'Semantic Scholar 请求过于频繁，请稍后重试'
      });
    }

    if (status >= 500) {
      return res.status(502).json({
        success: false,
        message: 'Semantic Scholar 推荐服务暂时不可用'
      });
    }

    return res.status(status).json({
      success: false,
      message: '推荐论文请求失败'
    });
  }
};
