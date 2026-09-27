import { HashRouter, Route, Routes } from 'react-router';
import { Home } from './screens/Home';
import { MicTest } from './screens/MicTest';

export function App() {
  return (
    <HashRouter>
      <div className="frame">
        <div className="band" aria-hidden="true" />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/mic-test" element={<MicTest />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </div>
    </HashRouter>
  );
}
