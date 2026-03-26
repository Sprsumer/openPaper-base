import React, { useState } from 'react';
import { searchPapers } from '../api/paperSearch';

const ChatSearch = ({ onAddPaper }) => {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content:
        '你好！我是 openPaper 助手（OpenClaw 驱动）。输入关键词、DOI、标题或作者，我可以基于真实学术数据源搜索论文，并生成关联关系网（OpenAlex / Semantic Scholar 轻量搜索方案）。'
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    if (loading) return;

    const keyword = input.trim();

    if (!keyword) {
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: '❌ 出错：请输入搜索关键词'
        }
      ]);
      setInput('');
      return;
    }

    setLoading(true);
    setMessages(prev => [...prev, { role: 'user', content: keyword }]);
    setInput('');

    try {
      const result = await searchPapers(keyword);

      if (!result.success) {
        throw new Error(result.message || '搜索失败');
      }

      const papers = result.data || [];

      if (!papers.length) {
        setMessages(prev => [
          ...prev,
          {
            role: 'assistant',
            content: '未找到相关文献，请尝试更换关键词。'
          }
        ]);
        return;
      }

      const seed = papers[0];
      const graphData = {
        seed: {
          paperId: String(seed.id),
          title: seed.title,
          authors: seed.authors || [],
          year: seed.year,
          doi: seed.doi || ''
        },
        related: papers.slice(1).map(item => ({
          paperId: String(item.id),
          title: item.title,
          authors: item.authors || [],
          year: item.year,
          doi: item.doi || ''
        }))
      };

      const content = `找到${papers.length}篇相关文献：\n${papers
        .map(item => `- ${item.title}（${(item.authors || []).join(', ')}）`)
        .join('\n')}`;

      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content
        }
      ]);

      if (onAddPaper) {
        onAddPaper(graphData);
      }
    } catch (err) {
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: `❌ 出错：${err.message || '请稍后重试'}`
        }
      ]);
    } finally {
      setLoading(false);
    }
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
