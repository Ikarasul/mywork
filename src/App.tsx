import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Navbar from './components/Navbar'
import SupabaseConfigBanner from './components/SupabaseConfigBanner'
import LocalDataMigrationBanner from './components/LocalDataMigrationBanner'
import { AuthProvider } from './lib/auth'
import LifeSchedulePage from './pages/LifeSchedulePage'
import ClassSchedulePage from './pages/ClassSchedulePage'
import TasksPage from './pages/TasksPage'
import GroupChatPage from './pages/GroupChatPage'
import LoginPage from './pages/LoginPage'
import GroupPage from './pages/GroupPage'

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="min-h-screen bg-slate-50 text-slate-900">
          <Navbar />
          <SupabaseConfigBanner />
          <LocalDataMigrationBanner />
          <main className="mx-auto max-w-6xl px-4 py-6">
            <Routes>
              <Route path="/" element={<Navigate to="/life" replace />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/group" element={<GroupPage />} />
              <Route path="/life" element={<LifeSchedulePage />} />
              <Route path="/schedule" element={<ClassSchedulePage />} />
              <Route path="/tasks" element={<TasksPage />} />
              <Route path="/chat" element={<GroupChatPage />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
