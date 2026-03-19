import React, { useState } from 'react';

const ChatSearch = ({ onAddPaper }) => {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content:
        '你好！我是 openPaper 助手（OpenClaw 驱动）。输入关键词、DOI、标题或作者，我帮你找论文并生成真实引用关系网～'
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchWithRetry = async (url, options = {}, retries = 2) => {
    for (let i = 0; i <= retries; i++) {
      try {
        const res = await fetch(url, {
          ...options,
          headers: {
            ...options.headers,
            'User-Agent':
              'openPaper/1.0<a href="https://github.com/Sprsumer/openPaper-base" target="_blank" rel="noopener noreferrer nofollow"></a>'
          }
        });
        if (res.status === 429) {
          await new Promise(resolve => setTimeout(resolve, 1200)); // 限流等待
          continue;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
      } catch (err) {
        if (i === retries) throw err;
        await new Promise(resolve => setTimeout(resolve, 800));
      }
    }
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    setLoading(true);
    const userMsg = { role: 'user', content: input };
    setMessages(prev => [...prev, userMsg]);

    try {
      // 1. 搜索论文（官方稳定端点）
      const searchRes = await fetchWithRetry(
        `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(
          input
        )}&limit=3&fields=paperId,title,authors,year,doi,externalIds`
      );
      const topPaper = searchRes && searchRes.data ? searchRes.data[0] : null;
      if (!topPaper) throw new Error('未找到匹配论文');

      const paper = {
        paperId: topPaper.paperId,
        title: topPaper.title,
        authors: topPaper.authors ? topPaper.authors.map(a => a.name) : ['未知'],
        year: topPaper.year,
        doi:
          topPaper.externalIds && topPaper.externalIds.DOI
            ? topPaper.externalIds.DOI
            : topPaper.doi || '无'
      };

      // 2. 获取真实相关论文（citations + references，代替废弃的 recommendations）
      const [citationsData, referencesData] = await Promise.all([
        fetchWithRetry(
          `https://api.semanticscholar.org/graph/v1/paper/${paper.paperId}/citations?limit=12&fields=paperId,title,authors,year,doi`
        ),
        fetchWithRetry(
          `https://api.semanticscholar.org/graph/v1/paper/${paper.paperId}/references?limit=12&fields=paperId,title,authors,year,doi`
        )
      ]);

      const relatedPapers = [
        ...((citationsData && citationsData.data) || []),
        ...((referencesData && referencesData.data) || [])
      ].slice(0, 15);

      const fullGraphData = {
        seed: paper,
        related: relatedPapers.map(p => ({
          paperId: p.paperId,
          title: p.title,
          authors: p.authors ? p.authors.map(a => a.name) : [],
          year: p.year,
          doi: p.externalIds && p.externalIds.DOI ? p.externalIds.DOI : p.doi || ''
        }))
      };

      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: `✅ 找到论文：${paper.title}\n已生成真实引用关系网（${relatedPapers.length} 篇相关论文）。点击中间图节点探索！`
        }
      ]);

      onAddPaper(fullGraphData);
    } catch (err) {
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: `❌ 出错：${err.message || '服务暂时不可用，请稍后再试'}`
        }
      ]);
    }
    setLoading(false);
    setInput('');
  };

  // UI 部分保持你原来的样式（头部、消息区、输入框）
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
