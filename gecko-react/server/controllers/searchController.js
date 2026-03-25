const { runSearch, SearchServiceError } = require('../services/search');

async function searchPapers(req, res) {
  try {
    const keyword = (req.query.keyword || '').trim();
    const limit = req.query.limit;

    if (!keyword) {
      return res.status(400).json({
        success: false,
        message: '关键词不能为空'
      });
    }

    const papers = await runSearch(keyword, { limit });

    return res.status(200).json({
      success: true,
      data: papers
    });
  } catch (err) {
    const status = err instanceof SearchServiceError ? err.status : 500;

    return res.status(status).json({
      success: false,
      message: `搜索异常：${err.message}`
    });
  }
}

module.exports = {
  searchPapers
};
