import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Sidebar from './components/Sidebar';
import Login from './pages/Login';
import Chat from './pages/Chat';
import KnowledgeBase from './pages/KnowledgeBase';
import Connectors from './pages/Connectors';
import AdminStats from './pages/AdminStats';
import UserManagement from './pages/UserManagement';
import { WebSocketProvider } from './context/WebSocketContext';

const MainLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div className="flex h-screen w-screen bg-app-radial">
      <Sidebar />
      <main className="flex-1 flex overflow-hidden">
        {children}
      </main>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <WebSocketProvider>
        <BrowserRouter>
          <Routes>
            {/* Public Routes */}
            <Route path="/login" element={<Login />} />

            {/* Protected Application Routes */}
            <Route
              path="/chat"
              element={
                <ProtectedRoute>
                  <MainLayout><Chat /></MainLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/knowledge"
              element={
                <ProtectedRoute>
                  <MainLayout><KnowledgeBase /></MainLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/connectors"
              element={
                <ProtectedRoute>
                  <MainLayout><Connectors /></MainLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/users"
              element={
                <ProtectedRoute adminOnly>
                  <MainLayout><UserManagement /></MainLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin"
              element={
                <ProtectedRoute adminOnly>
                  <MainLayout><AdminStats /></MainLayout>
                </ProtectedRoute>
              }
            />

            {/* Default Redirects */}
            <Route path="/" element={<Navigate to="/chat" replace />} />
            <Route path="*" element={<Navigate to="/chat" replace />} />
          </Routes>
        </BrowserRouter>
      </WebSocketProvider>
    </AuthProvider>
  );
};

export default App;
