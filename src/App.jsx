import React from 'react';
import Fretboard from './Fretboard';
import { LanguageProvider } from './i18n';

function App() {
  return (
    <LanguageProvider>
      <main>
        <Fretboard />
      </main>
    </LanguageProvider>
  );
}

export default App;
