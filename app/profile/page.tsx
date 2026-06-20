'use client'

import { User, Settings, Bell, Download, Shield, LogOut, ChevronRight, Award, Map } from 'lucide-react'
import ProtectedRoute from '@/components/ProtectedRoute'
import { useAuth } from '@/context/AuthContext'
import { useRouter } from 'next/navigation'

export default function ProfilePage() {
  const { user, logout } = useAuth()
  const router = useRouter()

  const stats = [
    { label: 'Planned', value: '12', icon: Map },
    { label: 'Visited', value: '8', icon: Award },
  ]

  const settingsList = [
    { label: 'Account Settings', desc: 'Manage personal details', icon: Settings },
    { label: 'Notifications', desc: 'Push & travel alerts', icon: Bell },
    { label: 'Offline Map Packages', desc: 'Save cellular data', icon: Download },
    { label: 'Privacy & Security', desc: 'Control your info', icon: Shield },
  ]

  const handleLogout = async () => {
    try {
      await logout()
      router.push('/auth')
    } catch (err) {
      console.error('Logout error:', err)
    }
  }

  return (
    <ProtectedRoute>
      <div className="w-full min-h-screen bg-slate-50 dark:bg-slate-950 pb-20 flex flex-col">
        {/* Header Profile Summary */}
        <div className="bg-gradient-to-br from-indigo-900 to-slate-900 text-white px-5 pt-8 pb-6 rounded-b-[32px] shadow-lg shrink-0">
          <div className="flex items-center gap-4">
            {/* Avatar Ring */}
            <div className="h-16 w-16 rounded-full bg-gradient-to-tr from-indigo-500 to-emerald-400 p-0.5 shadow-md shrink-0">
              <div className="h-full w-full rounded-full bg-slate-900 flex items-center justify-center text-white">
                <User className="h-7 w-7 text-indigo-200" />
              </div>
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-bold truncate">{user?.displayName || 'Traveler'}</h1>
              <p className="text-[10px] text-indigo-200 font-medium mt-0.5">{user?.email || 'Premium AI Explorer'}</p>
              <p className="text-[9px] text-slate-405 text-indigo-300/60 font-normal mt-0.5">Joined BharatYatra</p>
            </div>
          </div>

          {/* Horizontal Mini Stats Dashboard */}
          <div className="grid grid-cols-2 gap-3 mt-6 bg-slate-950/40 backdrop-blur-md rounded-2xl p-3 border border-white/5">
            {stats.map((stat, idx) => {
              const Icon = stat.icon
              return (
                <div key={idx} className="flex items-center gap-2.5 px-1">
                  <div className="h-7 w-7 rounded-lg bg-indigo-500/20 flex items-center justify-center shrink-0">
                    <Icon className="h-4 w-4 text-indigo-300" />
                  </div>
                  <div>
                    <span className="block text-[10px] text-indigo-200/50 uppercase font-bold tracking-wider">{stat.label}</span>
                    <span className="block text-xs font-extrabold text-white mt-0.5">{stat.value} Places</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Settings Options List */}
        <div className="p-4 space-y-4">
          <h2 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest pl-1">App Configuration</h2>
          
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-[0_4px_12px_rgba(0,0,0,0.015)] dark:shadow-none divide-y divide-slate-50 dark:divide-slate-800/40 overflow-hidden">
            {settingsList.map((item, idx) => {
              const Icon = item.icon
              return (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3.5 hover:bg-slate-50 dark:hover:bg-slate-900 cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-slate-50 dark:bg-slate-800 flex items-center justify-center shrink-0">
                      <Icon className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                    </div>
                    <div>
                      <span className="block text-xs font-bold text-slate-800 dark:text-slate-100">{item.label}</span>
                      <span className="block text-[9px] text-slate-400 mt-0.5">{item.desc}</span>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-350 dark:text-slate-600" />
                </div>
              )
            })}
          </div>

          {/* Exit CTA */}
          <div className="pt-2">
            <button 
              onClick={handleLogout}
              className="w-full h-11 border border-rose-100 dark:border-rose-950/40 bg-rose-50/20 dark:bg-rose-950/10 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-rose-600 dark:text-rose-400 text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition-all"
            >
              <LogOut className="h-4 w-4" />
              Logout Account
            </button>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  )
}
