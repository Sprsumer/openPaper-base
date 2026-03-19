import React, { useState } from 'react';

const ChatSearch = ({ onAddPaper }) => {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content:
        '你好！我是 openPaper 助手（OpenClaw 驱动）。输入关键词、DOI、标题或作者，我帮你找论文并生成真实相似关系网～'
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
      // 1. 调用后端 proxy 搜索（稳定、无 CORS）
      const searchRes = await fetch(`/api/openalex/search?q=${encodeURIComponent(input)}`);
      if (!searchRes.ok) throw new Error('搜索失败');
      const searchData = await searchRes.json();
      const topWork = searchData && searchData.results ? searchData.results[0] : null;
      if (!topWork) throw new Error('未找到匹配论文');

      const paper = {
        paperId: topWork.id.replace('https://openalex.org/', ''),
        title: topWork.title,
        authors: topWork.authorships
          ? topWork.authorships.map(a => (a.author ? a.author.display_name : null)).filter(Boolean)
          : ['未知'],
        year: topWork.year,
        doi: topWork.doi || (topWork.ids ? topWork.ids.doi : null) || '无'
      };

      // 2. 调用后端 proxy 获取相关论文
      const titleKeywords = paper.title
        .split(' ')
        .slice(0, 5)
        .join(' ');
      const relatedRes = await fetch(
        `/api/openalex/related?keywords=${encodeURIComponent(titleKeywords)}`
      );
      if (!relatedRes.ok) throw new Error('相关论文搜索失败');
      const relatedData = await relatedRes.json();
      const relatedPapers = relatedData.results || [];

      const fullGraphData = {
        seed: paper,
        related: relatedPapers.map(p => ({
          paperId: p.id.replace('https://openalex.org/', ''),
          title: p.title,
          authors: p.authorships
            ? p.authorships.map(a => (a.author ? a.author.display_name : null)).filter(Boolean)
            : [],
          year: p.year,
          doi: p.doi || (p.ids ? p.ids.doi : null) || ''
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
          content: `❌ 出错：${err.message}`
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
