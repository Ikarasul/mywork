import { BrowserRouter, Route, Routes } from 'react-router-dom'
import AppShell from './components/AppShell'
import SupabaseConfigBanner from './components/SupabaseConfigBanner'
import LocalDataMigrationBanner from './components/LocalDataMigrationBanner'
import { AuthProvider } from './lib/auth'
import { ThemeProvider } from './lib/theme'
import TodayPage from './pages/TodayPage'
import LifeSchedulePage from './pages/LifeSchedulePage'
import ClassSchedulePage from './pages/ClassSchedulePage'
import TasksPage from './pages/TasksPage'
import GroupChatPage from './pages/GroupChatPage'
import LoginPage from './pages/LoginPage'
import GroupPage from './pages/GroupPage'
import SharedViewPage from './pages/SharedViewPage'
import NotFoundPage from './pages/NotFoundPage'

export function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <AppShell
            banners={
              <>
                <SupabaseConfigBanner />
                <LocalDataMigrationBanner />
              </>
            }
          >
            <Routes>
              <Route path="/" element={<TodayPage />} />
              <Route path="/today" element={<TodayPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/group" element={<GroupPage />} />
              <Route path="/share/:token" element={<SharedViewPage />} />
              <Route path="/life" element={<LifeSchedulePage />} />
              <Route path="/schedule" element={<ClassSchedulePage />} />
              <Route path="/tasks" element={<TasksPage />} />
              <Route path="/chat" element={<GroupChatPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </AppShell>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  )
}

export default App
