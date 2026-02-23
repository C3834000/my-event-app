
import React from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import EventsBoard from './pages/EventsBoard';
import CustomersBoard from './pages/CustomersBoard';
import LeadsBoard from './pages/LeadsBoard';
import TasksBoard from './pages/TasksBoard';
import ChartsBoard from './pages/ChartsBoard';
import Settings from './pages/Settings';
import BookingForm from './pages/BookingForm';
import FormsManagement from './pages/FormsManagement';
import ClientJourneyPortal from './pages/ClientJourneyPortal';

const App: React.FC = () => {
  return (
    <AppProvider>
      <HashRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="events" element={<EventsBoard />} />
            <Route path="customers" element={<CustomersBoard />} />
            <Route path="leads" element={<LeadsBoard />} />
            <Route path="tasks" element={<TasksBoard />} />
            <Route path="charts" element={<ChartsBoard />} />
            <Route path="forms" element={<FormsManagement />} />
            <Route path="settings" element={<Settings />} />
          </Route>
          {/* Public Routes */}
          <Route path="/book" element={<BookingForm />} />
          <Route path="/portal/:id" element={<ClientJourneyPortal />} />
        </Routes>
      </HashRouter>
    </AppProvider>
  );
};

export default App;
