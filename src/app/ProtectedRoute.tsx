import { Navigate } from 'react-router-dom'
import { useAuth } from '../features/auth/useAuth'

interface Props {
  children: React.ReactNode
}

export function ProtectedRoute({ children }: Props) {
  const { user, loading } = useAuth()

  if (loading) {
    return <div className="flex items-center justify-center h-dvh paper-dots"><div className="spinner" /></div>
  }

  if (!user) {
    return <Navigate to="/signin" replace />
  }

  return <>{children}</>
}
