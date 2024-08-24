import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import HomePage from './HomePage';
import Visualizer from './Visualizer';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/visualize" element={<Visualizer />} />
      </Routes>
    </Router>
  );
}

export default App;
