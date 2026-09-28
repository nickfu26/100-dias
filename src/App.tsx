import { HashRouter, Route, Routes } from 'react-router';
import { Home } from './screens/Home';
import { Lesson } from './screens/Lesson';
import { MicTest } from './screens/MicTest';
import { Settings } from './screens/Settings';

export function App() {
  return (
    <HashRouter>
      <div className="frame">
        <div className="band" aria-hidden="true" />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/day/:day" element={<Lesson />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/mic-test" element={<MicTest />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </div>
    </HashRouter>
  );
}
