import { HashRouter, Route, Routes } from 'react-router';
import { Home } from './screens/Home';
import { CheckpointScreen, Lesson, Review } from './screens/Lesson';
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
          <Route path="/review" element={<Review />} />
          <Route path="/checkpoint/:n" element={<CheckpointScreen />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/mic-test" element={<MicTest />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </div>
    </HashRouter>
  );
}
