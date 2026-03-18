import React, { useState } from 'react';

const getErrorMessage = (err, fallback) => {
  if (err && err.message) return err.message;
  return fallback;
};

const ChatSearch = ({ onAddPaper }) => {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content:
        '你好！我是 openPaper 助手（OpenClaw 驱动）。输入关键词、DOI、标题或作者，我帮你找论文并生成相似关系网～'
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    setLoading(true);
    const query = input;
    const userMsg = { role: 'user', content: query };
    setMessages(prev => [...prev, userMsg]);

    try {
      const searchRes = await fetch(`/api/semantic/search?q=${encodeURIComponent(query)}`);
      const searchPayload = await searchRes.json();

      if (!searchRes.ok || !searchPayload.success) {
        throw new Error(searchPayload.message || `搜索接口异常（${searchRes.status}）`);
      }

      const topPaper =
        searchPayload && searchPayload.data && searchPayload.data.data
          ? searchPayload.data.data[0]
          : null;

      if (!topPaper) {
        throw new Error('没有找到匹配论文，请尝试更具体的关键词或 DOI');
      }

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

      const recRes = await fetch(
        `/api/semantic/recommendations?paperId=${encodeURIComponent(paper.paperId)}`
      );
      const recPayload = await recRes.json();

      if (!recRes.ok || !recPayload.success) {
        throw new Error(recPayload.message || `推荐接口异常（${recRes.status}）`);
      }

      const similarPapers =
        recPayload && recPayload.data && recPayload.data.recommendedPapers
          ? recPayload.data.recommendedPapers
          : [];

      const fullGraphData = {
        seed: paper,
        similar: similarPapers.map(p => ({
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
          content: `✅ 找到论文：${paper.title}\n已生成相似关系网（${similarPapers.length} 篇推荐论文）。点击中间图节点探索！`
        }
      ]);

      if (onAddPaper) {
        onAddPaper(fullGraphData);
      }
    } catch (err) {
      const readableMessage = getErrorMessage(
        err,
        '搜索服务暂时不可用，请检查本地服务是否启动或稍后重试'
      );
      setMessages(prev => [...prev, { role: 'assistant', content: `❌ 出错：${readableMessage}` }]);
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
