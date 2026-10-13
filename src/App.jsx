import React, { useEffect, useState } from 'react';
import Fretboard from './Fretboard';
import { LanguageProvider } from './i18n';

// 路由：默认普通编辑页；#/dynamic 动态编辑页（画动图）
function App() {
  const [route, setRoute] = useState(() => window.location.hash);
  useEffect(() => {
    const onHash = () => setRoute(window.location.hash);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const dynamic = route.startsWith('#/dynamic');
  return (
    <LanguageProvider>
      <main>
        <Fretboard key={dynamic ? 'dynamic' : 'normal'} mode={dynamic ? 'dynamic' : 'normal'} />
      </main>
    </LanguageProvider>
  );
}

export default App;
