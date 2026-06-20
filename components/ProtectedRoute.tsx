'use client'

import { useAuth } from '@/context/AuthContext'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth')
    }
  }, [user, loading, router])

  // Native spinner visual when waiting for auth resolve state
  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[50vh] p-6 bg-slate-50 dark:bg-slate-950">
        <div className="h-9 w-9 rounded-full border-[3px] border-indigo-600/10 border-t-indigo-600 animate-spin" />
        <p className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-4">Loading Travel Plan...</p>
      </div>
    )
  }

  // Prevent flash content before redirect is triggered
  if (!user) {
    return null
  }

  return <>{children}</>
}
