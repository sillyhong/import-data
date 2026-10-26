import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import Tradesns from './Tradesns';
import Detail from './Detail';
import Importgenius from './Importgenius';
import Importyeti from './Importyeti';
import TaskRunner from './TaskRunner';
import RobotTasks from './RobotTasks';
import SchedulerLogs from './SchedulerLogs';
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
        <Route path="importyeti" element={<Importyeti />} />
        <Route path="tasks" element={<TaskRunner />} />
        <Route path="robot-tasks" element={<RobotTasks />} />
        <Route path="scheduler-logs" element={<SchedulerLogs />} />
        <Route path="task-logs" element={<SchedulerLogs />} />
      </Route>
    </Routes>

  </Router>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
