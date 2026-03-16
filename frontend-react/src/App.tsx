import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Sidebar from './components/Sidebar';
import Login from './pages/Login';
import Home from './pages/Home';
import Chat from './pages/Chat';
import KnowledgeBase from './pages/KnowledgeBase';
import KnowledgeGraph from './pages/KnowledgeGraph';
import Connectors from './pages/Connectors';
import AdminStats from './pages/AdminStats';
import UserManagement from './pages/UserManagement';
import { WebSocketProvider } from './context/WebSocketContext';
import { ChatProvider } from './context/ChatContext';
import { VideoCallProvider } from './context/VideoCallContext';
import { Menu } from 'lucide-react';

const MainLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);

  return (
    <div className="flex h-screen w-screen bg-app-radial overflow-hidden">
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        {/* Mobile Header */}
        <div className="md:hidden flex items-center justify-between p-4 bg-black/20 backdrop-blur-md border-b border-white/5 z-20">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-accent-gradient flex items-center justify-center shadow-glow">
              <span className="text-white font-bold text-xs">N</span>
            </div>
            <span className="text-xl font-outfit font-bold text-white tracking-wide">Nexus</span>
          </div>
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="p-2 text-textSec hover:text-white"
          >
            <Menu size={24} />
          </button>
        </div>

        {children}
      </main>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <WebSocketProvider>
        <ChatProvider>
          <VideoCallProvider>
          <BrowserRouter>
            <Routes>
            {/* Public Routes */}
            <Route path="/login" element={<Login />} />

            {/* Protected Application Routes */}
            <Route
              path="/home"
              element={
                <ProtectedRoute>
                  <MainLayout><Home /></MainLayout>
                </ProtectedRoute>
              }
            />
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
              path="/graph"
              element={
                <ProtectedRoute>
                  <MainLayout><KnowledgeGraph /></MainLayout>
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
            <Route path="/" element={<Navigate to="/home" replace />} />
            <Route path="*" element={<Navigate to="/home" replace />} />
          </Routes>
          </BrowserRouter>
          </VideoCallProvider>
        </ChatProvider>
      </WebSocketProvider>
    </AuthProvider>
  );
};

export default App;
