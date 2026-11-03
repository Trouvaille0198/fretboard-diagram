import React, { useEffect, useState } from 'react';
import Fretboard from './Fretboard';
import { ChordChartView } from './components/ChordChartView';
import { ChartListPage } from './components/ChartListPage';
import { TopNav } from './components/TopNav';
import { LanguageProvider } from './i18n';
import { hydrateBigStores } from './utils/idbStore';

// 路由：默认普通编辑页；#/dynamic 动态编辑页（画动图）；#/chords 和弦谱页（8pu 式功能谱）
// 顶部 TopNav 是三个模式的统一入口，常驻所有页面
function App() {
  const [route, setRoute] = useState(() => window.location.hash);
  // 启动门：谱子库/动图池/回收站已迁 IndexedDB（异步）——先灌进内存缓存再渲染路由，
  // 各页面的同步 loadCharts() 初始化才不会读到空库（灌入是几次 IDB 读，毫秒级）
  const [ready, setReady] = useState(false);
  useEffect(() => {
    hydrateBigStores().finally(() => setReady(true));
  }, []);
  useEffect(() => {
    const onHash = () => setRoute(window.location.hash);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const dynamic = route.startsWith('#/dynamic');
  const chords = route.startsWith('#/chords');
  // #/chords 本身 = 曲目列表（库）；#/chords?id=xxx = 某首曲子的编辑页（可刷新/可深链）
  const chordId = chords ? (new URLSearchParams((route.split('?')[1] || '')).get('id') || null) : null;
  const mode = chords ? 'chords' : (dynamic ? 'dynamic' : 'normal');
  if (!ready) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: '#9fb2c0' }}>加载曲库…</div>;
  return (
    <LanguageProvider>
      <TopNav mode={mode} />
      <main className="app-main">
        {chords ? (chordId
          ? <ChordChartView key={'chords-' + chordId} songId={chordId} />
          : <ChartListPage key="chords-list" />
        ) : (
          <Fretboard key={dynamic ? 'dynamic' : 'normal'} mode={dynamic ? 'dynamic' : 'normal'} />
        )}
      </main>
    </LanguageProvider>
  );
}

export default App;
