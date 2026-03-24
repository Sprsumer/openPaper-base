function searchPapers(req, res) {
  try {
    const keyword = (req.query.keyword || '').trim();

    if (!keyword) {
      return res.status(400).json({
        success: false,
        message: '关键词不能为空'
      });
    }

    const mockResult = [
      {
        id: 101,
        title: '航空航天领域的文献关联分析研究',
        authors: ['张三', '李四'],
        journal: '航空学报',
        year: 2024
      },
      {
        id: 102,
        title: '基于Connected Papers的航天文献聚类方法',
        authors: ['王五'],
        journal: '宇航学报',
        year: 2023
      }
    ];

    return res.status(200).json({
      success: true,
      data: mockResult
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: `搜索异常：${err.message}`
    });
  }
}

module.exports = {
  searchPapers
};
