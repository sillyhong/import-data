import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import Tradesns from './Tradesns';
import Detail from './Detail';
import Importgenius from './Importgenius';
import AppLayout from './AppLayout';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import reportWebVitals from './reportWebVitals';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <Router>
    <Routes>
      <Route path="/app" element={<AppLayout />}>
        <Route index element={<App />} />
        <Route path="tradesns" element={<Tradesns />} />
        <Route path="detail" element={<Detail />} />
        <Route path="importgenius" element={<Importgenius />} />
      </Route>
    </Routes>

  </Router>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
