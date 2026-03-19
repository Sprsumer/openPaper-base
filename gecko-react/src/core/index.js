import React from 'react';
import Modal from './ui/Modal';
import RightPanel from 'core/ui/RightPanel';
import ChatSearch from '../components/ChatSearch';
import { Store, useDataStore } from 'core/state/data';
import { Filters, useFilters } from 'core/state/filters';
import { UI, useUserInterface } from 'core/state/ui';
import { getDataModules, getImportModules } from 'core/module-loader';

function mapSemanticPaper(paper, isSeed = false) {
  if (!paper) return null;

  return {
    paperId: paper.paperId,
    title: paper.title,
    author: (paper.authors || []).join(', ') || '未知',
    year: paper.year,
    doi: paper.doi,
    seed: isSeed
  };
}

function App() {
  const store = useDataStore();
  const ui = useUserInterface();
  const filters = useFilters();

  const addPaper = fullGraphData => {
    if (!fullGraphData || !fullGraphData.seed) return;

    const seedPaper = mapSemanticPaper(fullGraphData.seed, true);
    const relatedPapers = (fullGraphData.related || []).map(p => mapSemanticPaper(p, false));

    store.updatePapers(
      [
        {
          ...seedPaper,
          references: relatedPapers
        }
      ],
      true
    );

    ui.setRightPanel('network');
    ui.setLeftPanel(null);
  };

  const selectedPaper = store.Papers[ui.selectedPapers[0]];

  return (
    <Store.Provider value={store}>
      <UI.Provider value={ui}>
        <Filters.Provider value={filters}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '380px 1fr 360px',
              height: '100vh',
              gap: '8px',
              padding: '8px',
              background: '#f5f5f5'
            }}
          >
            <div
              style={{
                background: '#fff',
                borderRadius: '12px',
                overflow: 'hidden',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
              }}
            >
              <ChatSearch onAddPaper={addPaper} />
            </div>

            <div
              style={{
                background: '#fff',
                borderRadius: '12px',
                overflow: 'hidden',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
              }}
            >
              <RightPanel />
            </div>

            <div
              style={{
                background: '#fff',
                borderRadius: '12px',
                padding: '20px',
                overflow: 'auto',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
              }}
            >
              {selectedPaper ? (
                <div>
                  <h3>{selectedPaper.title || selectedPaper.unstructured || selectedPaper.doi}</h3>
                  <p>
                    <strong>作者：</strong>
                    {selectedPaper.author || '未知'}
                  </p>
                  <p>
                    <strong>DOI：</strong>
                    {selectedPaper.doi || '未知'}
                  </p>
                  <p>
                    <strong>年份：</strong>
                    {selectedPaper.year || '未知'}
                  </p>
                  <p style={{ color: '#666' }}>（右侧 AI 分析 + easyScholar 分区即将接入）</p>
                </div>
              ) : (
                <p style={{ color: '#888', textAlign: 'center', marginTop: '100px' }}>
                  点击中间图中节点查看详情
                </p>
              )}
            </div>
          </div>
          <Modal />
        </Filters.Provider>
        {getImportModules().map(({ component }) => component && React.createElement(component))}
      </UI.Provider>
      {getDataModules().map(dataModule => React.createElement(dataModule))}
    </Store.Provider>
  );
}

export default App;
