import React, { useState } from 'react';

const ChatSearch = ({ onAddPaper }) => {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content:
        '你好！我是 openPaper 助手（OpenClaw 驱动）。输入关键词、DOI、标题或作者，我帮你找论文并生成真实相似关系网～（已复刻 Connected Papers 原版搜索）'
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    setLoading(true);
    const userMsg = { role: 'user', content: input };
    setMessages(prev => [...prev, userMsg]);

    try {
      // 1. 调用服务器已有 proxy（原 CitationGecko 稳定端点）
      const searchRes = await fetch(
        `/api/semantic/search?query=${encodeURIComponent(input)}&limit=3`
      );
      if (!searchRes.ok) throw new Error('搜索失败');
      const searchData = await searchRes.json();
      const topPaper = searchData && searchData.data ? searchData.data[0] : null;
      if (!topPaper) throw new Error('未找到匹配论文');

      const paper = {
        paperId: topPaper.paperId,
        title: topPaper.title,
        authors: topPaper.authors ? topPaper.authors.map(a => a.name) : ['未知'],
        year: topPaper.year,
        doi: topPaper.doi || '无'
      };

      // 2. 调用服务器已有 recommendations（原 Connected Papers 核心）
      const recRes = await fetch(`/api/semantic/recommendations?paperId=${paper.paperId}&limit=15`);
      if (!recRes.ok) throw new Error('相关论文失败');
      const recData = await recRes.json();
      const relatedPapers = recData.recommendedPapers || [];

      const fullGraphData = {
        seed: paper,
        related: relatedPapers.map(p => ({
          paperId: p.paperId,
          title: p.title,
          authors: p.authors ? p.authors.map(a => a.name) : [],
          year: p.year,
          doi: p.doi || ''
        }))
      };

      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: `✅ 找到论文：${paper.title}\n已生成真实相似关系网（${relatedPapers.length} 篇）。点击中间图节点探索！`
        }
      ]);

      onAddPaper(fullGraphData);
    } catch (err) {
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: `❌ 出错：${err.message || '请稍后重试'}`
        }
      ]);
    }
    setLoading(false);
    setInput('');
  };

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        borderRight: '1px solid #ddd'
      }}
    >
      <div
        style={{
          padding: '16px',
          background: '#f8f9fa',
          fontWeight: 'bold',
          borderBottom: '1px solid #ddd'
        }}
      >
        openPaper 聊天搜索（OpenClaw）
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        {messages.map((m, i) => (
          <div
            key={i}
            style={{ marginBottom: '16px', textAlign: m.role === 'user' ? 'right' : 'left' }}
          >
            <strong>{m.role === 'user' ? '你' : '助手'}：</strong>
            <br />
            {m.content}
          </div>
        ))}
        {loading && <div>正在搜索并生成关系网...</div>}
      </div>
      <div style={{ padding: '12px', borderTop: '1px solid #ddd' }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder="关键词 / DOI / 标题 / 作者..."
          disabled={loading}
          style={{ width: '100%', padding: '14px', borderRadius: '8px', border: '1px solid #ccc' }}
        />
      </div>
    </div>
  );
};

export default ChatSearch;
