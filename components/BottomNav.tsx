'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Compass, Map, PlusCircle, User } from 'lucide-react'

export default function BottomNav() {
  const pathname = usePathname()

  const tabs = [
    { name: 'Explore', href: '/explore', icon: Compass },
    { name: 'My Trips', href: '/my-trips', icon: Map },
    { name: 'Create', href: '/create', icon: PlusCircle },
    { name: 'Profile', href: '/profile', icon: User },
  ]

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 h-16 bg-white/70 dark:bg-slate-900/75 backdrop-blur-lg border-t border-slate-200/40 dark:border-slate-800/40 shadow-[0_-4px_24px_-4px_rgba(0,0,0,0.08)] max-w-md mx-auto rounded-t-2xl">
      <div className="flex h-full items-center justify-around px-2">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive = pathname === tab.href || (tab.href !== '/explore' && pathname?.startsWith(tab.href))

          return (
            <Link
              key={tab.name}
              href={tab.href}
              className={`flex flex-col items-center justify-center flex-1 h-full py-1 text-xs font-medium tap-highlight-transparent transition-all duration-200 relative ${
                isActive 
                  ? 'text-indigo-600 dark:text-indigo-400 scale-105' 
                  : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
              }`}
            >
              <Icon 
                className={`h-5 w-5 mb-0.5 transition-transform duration-200 ${
                  isActive ? 'stroke-[2.5px] text-indigo-600 dark:text-indigo-400' : 'stroke-[1.8px]'
                }`} 
              />
              <span className="text-[10px] tracking-wide font-medium">{tab.name}</span>
              {isActive && (
                <span className="absolute bottom-1 w-1.5 h-1.5 rounded-full bg-indigo-600 dark:bg-indigo-400 transition-all duration-300 shadow-[0_0_8px_#4f46e5]" />
              )}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
