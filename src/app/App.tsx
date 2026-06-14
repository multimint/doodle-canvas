import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '../features/auth/useAuth'
import { GoogleSignIn } from '../features/auth/GoogleSignIn'
import { Dashboard } from '../features/dashboard/Dashboard'
import { CanvasPage } from '../features/canvas/CanvasPage'
import { ProtectedRoute } from './ProtectedRoute'

export function App() {
  const { user, loading } = useAuth()

  if (loading) {
    return <div className="loading-screen"><div className="spinner" /></div>
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/signin"
          element={user ? <Navigate to="/" replace /> : <GoogleSignIn />}
        />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/canvas/:canvasId"
          element={
            <ProtectedRoute>
              <CanvasPage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
