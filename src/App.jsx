import React, { useEffect, useState } from 'react';
import Fretboard from './Fretboard';
import { ChordChartView } from './components/ChordChartView';
import { ChartListPage } from './components/ChartListPage';
import { TopNav } from './components/TopNav';
import { LanguageProvider } from './i18n';

// 路由：默认普通编辑页；#/dynamic 动态编辑页（画动图）；#/chords 和弦谱页（8pu 式功能谱）
// 顶部 TopNav 是三个模式的统一入口，常驻所有页面
function App() {
  const [route, setRoute] = useState(() => window.location.hash);
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
