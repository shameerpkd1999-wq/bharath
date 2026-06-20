'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useRouter } from 'next/navigation'
import { Compass, Mail, Lock, User, Sparkles, AlertCircle } from 'lucide-react'

export default function AuthPage() {
  const { user, signUp, login, loginWithGoogle, loading } = useAuth()
  const router = useRouter()
  
  const [isLogin, setIsLogin] = useState(true)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  // Redirect if already authenticated
  useEffect(() => {
    if (user) {
      router.push('/explore')
    }
  }, [user, router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    
    if (!email || !password || (!isLogin && !name)) {
      setError('Please fill out all fields')
      return
    }

    setActionLoading(true)
    try {
      if (isLogin) {
        await login(email, password)
      } else {
        await signUp(email, password, name)
      }
      router.push('/explore')
    } catch (err: any) {
      console.error(err)
      setError(err?.message || 'Authentication failed. Please try again.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleGoogleSignIn = async () => {
    setError('')
    setActionLoading(true)
    try {
      await loginWithGoogle()
      router.push('/explore')
    } catch (err: any) {
      console.error(err)
      setError(err?.message || 'Google Sign-in failed.')
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <div className="w-full min-h-screen bg-slate-50 dark:bg-slate-950 pb-6 flex flex-col justify-center px-6">
      {/* Brand Header */}
      <div className="flex flex-col items-center mb-6">
        <div className="h-12 w-12 rounded-2xl bg-gradient-to-tr from-indigo-600 to-indigo-700 flex items-center justify-center text-white shadow-lg shadow-indigo-200 dark:shadow-none mb-3">
          <Compass className="h-6 w-6 animate-pulse" />
        </div>
        <h1 className="text-lg font-black text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
          BharatYatra
          <Sparkles className="h-4 w-4 text-indigo-500 fill-indigo-500" />
        </h1>
        <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium uppercase tracking-widest mt-1">AI India Travel Planner</p>
      </div>

      {/* Auth Card container */}
      <div className="bg-white dark:bg-slate-900 rounded-[28px] border border-slate-100 dark:border-slate-800 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.03)] dark:shadow-none p-5">
        
        {/* Toggle Slider */}
        <div className="relative flex p-1 bg-slate-100 dark:bg-slate-800 rounded-xl mb-5">
          <div 
            className={`absolute top-1 bottom-1 w-[calc(50%-4px)] bg-white dark:bg-slate-700 shadow-sm rounded-lg transition-transform duration-300 ${
              isLogin ? 'translate-x-0' : 'translate-x-full'
            }`} 
          />
          <button
            type="button"
            onClick={() => { setIsLogin(true); setError(''); }}
            className={`w-1/2 py-2 text-xs font-bold z-10 transition-colors ${
              isLogin ? 'text-indigo-600 dark:text-indigo-300' : 'text-slate-450 dark:text-slate-400'
            }`}
          >
            Login
          </button>
          <button
            type="button"
            onClick={() => { setIsLogin(false); setError(''); }}
            className={`w-1/2 py-2 text-xs font-bold z-10 transition-colors ${
              !isLogin ? 'text-indigo-600 dark:text-indigo-300' : 'text-slate-450 dark:text-slate-400'
            }`}
          >
            Sign Up
          </button>
        </div>

        {/* Error Alert Box */}
        {error && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 text-rose-600 dark:text-rose-450 mb-4 text-[10px] font-bold leading-normal">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-500" />
            <span className="break-words">{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider pl-1">Name</label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Enter full name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full h-11 pl-10 pr-4 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/35 transition-all text-slate-800 dark:text-slate-100 font-medium"
                />
              </div>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider pl-1">Email</label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="email"
                placeholder="Enter email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-11 pl-10 pr-4 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/35 transition-all text-slate-800 dark:text-slate-100 font-medium"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider pl-1">Password</label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="password"
                placeholder="Enter account password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-11 pl-10 pr-4 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/35 transition-all text-slate-800 dark:text-slate-100 font-medium"
              />
            </div>
          </div>

          {/* Primary Action Button */}
          <button
            type="submit"
            disabled={actionLoading || loading}
            className="w-full h-11 bg-indigo-600 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white font-bold text-xs rounded-xl shadow-lg shadow-indigo-100 dark:shadow-none flex items-center justify-center transition-all hover:opacity-90 active:scale-95 disabled:opacity-50 mt-5"
          >
            {actionLoading ? (
              <div className="h-5 w-5 rounded-full border-2 border-white/20 border-t-white animate-spin" />
            ) : isLogin ? (
              'Sign In'
            ) : (
              'Create Account'
            )}
          </button>
        </form>

        {/* Divider */}
        <div className="relative flex py-4 items-center">
          <div className="flex-grow border-t border-slate-100 dark:border-slate-800" />
          <span className="flex-shrink mx-3 text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">or</span>
          <div className="flex-grow border-t border-slate-100 dark:border-slate-800" />
        </div>

        {/* Alternative Google Sign In */}
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={actionLoading || loading}
          className="w-full h-11 border border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900 rounded-xl text-slate-600 dark:text-slate-350 font-bold text-xs flex items-center justify-center gap-2.5 transition-colors disabled:opacity-50"
        >
          {/* SVG Google Logo */}
          <svg className="h-4.5 w-4.5" viewBox="0 0 24 24" width="18" height="18">
            <path
              fill="#EA4335"
              d="M12 5.04c1.67 0 3.2.58 4.38 1.71l3.27-3.27C17.67 1.6 15.02 1 12 1 7.35 1 3.38 3.67 1.44 7.56l3.82 2.96c.92-2.76 3.5-4.48 6.74-4.48z"
            />
            <path
              fill="#4285F4"
              d="M23.49 12.27c0-.81-.07-1.59-.2-2.34H12v4.44h6.44c-.28 1.47-1.11 2.71-2.35 3.55l3.65 2.83c2.14-1.97 3.75-4.88 3.75-8.48z"
            />
            <path
              fill="#FBBC05"
              d="M5.26 14.52c-.24-.71-.38-1.47-.38-2.26s.14-1.55.38-2.26L1.44 7.04C.52 8.89 0 10.95 0 13s.52 4.11 1.44 5.96l3.82-2.96z"
            />
            <path
              fill="#34A853"
              d="M12 23c3.24 0 5.97-1.07 7.96-2.91l-3.65-2.83c-1.01.68-2.3 1.09-3.92 1.09-3.24 0-5.82-1.72-6.74-4.48L1.83 16.8C3.78 20.69 7.74 23 12 23z"
            />
          </svg>
          Alternative: Sign In with Google
        </button>
      </div>
    </div>
  )
}
