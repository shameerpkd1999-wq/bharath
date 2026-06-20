'use client'

import { MapPin, Calendar, Users, Compass, ChevronRight, Plus, Trash2 } from 'lucide-react'
import Link from 'next/link'
import ProtectedRoute from '@/components/ProtectedRoute'
import { useAuth } from '@/context/AuthContext'
import { useState, useEffect } from 'react'
import { db } from '@/lib/firebase'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { Trip, TripWithWaypoints } from '@/types/travel'

interface MyTripDisplayItem {
  id: string
  title: string
  cities: string
  dates: string
  status: string
  statusColor: string
  companions: string
  coverUrl: string | null
  image: string
  createdAt: string
}

export default function MyTripsPage() {
  const { user } = useAuth()
  const [tripsList, setTripsList] = useState<MyTripDisplayItem[]>([])
  const [loadingTrips, setLoadingTrips] = useState(true)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [tripToDelete, setTripToDelete] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const openDeleteConfirm = (id: string) => {
    setTripToDelete(id)
    setShowDeleteModal(true)
  }

  const handleDelete = async () => {
    if (!tripToDelete) return
    setDeleting(true)
    
    // A. Delete from Firestore (non-blocking if Firestore is disabled)
    try {
      const { deleteDoc, doc } = await import('firebase/firestore')
      await deleteDoc(doc(db, 'trips', tripToDelete))
    } catch (err) {
      console.warn('Could not delete trip from Firestore:', err)
    }

    // B. Delete from localStorage
    try {
      const localTripsStr = localStorage.getItem('local_trips') || '[]'
      const localTrips = JSON.parse(localTripsStr)
      const updatedTrips = localTrips.filter((t: Trip) => t.id !== tripToDelete)
      localStorage.setItem('local_trips', JSON.stringify(updatedTrips))
    } catch (err) {
      console.error('Error deleting trip from localStorage:', err)
    }

    // Update state list
    setTripsList(prev => prev.filter(t => t.id !== tripToDelete))
    
    setDeleting(false)
    setShowDeleteModal(false)
    setTripToDelete(null)
  }

  useEffect(() => {
    if (!user) return
    const uid = user.uid

    async function loadTrips() {
      setLoadingTrips(true)
      const fbTrips: Trip[] = []
      
      try {
        const q = query(collection(db, 'trips'), where('userId', '==', uid))
        const querySnapshot = await getDocs(q)
        querySnapshot.forEach((docSnap) => {
          fbTrips.push({
            id: docSnap.id,
            ...docSnap.data()
          } as Trip)
        })
      } catch (err) {
        console.warn('⚠️ Could not fetch trips from Firestore (database might be disabled/uninitialized):', err)
      }

      // Load from localStorage
      let localTrips: TripWithWaypoints[] = []
      try {
        const localTripsStr = localStorage.getItem('local_trips') || '[]'
        const parsed = JSON.parse(localTripsStr)
        // Filter local trips by the logged-in user's UID to keep them scoped
        localTrips = parsed.filter((t: TripWithWaypoints) => t.userId === uid)
      } catch (err) {
        console.error('Failed to load local trips:', err)
      }

      // Merge and de-duplicate by ID
      const allTripsMap = new Map<string, MyTripDisplayItem>()

      // Merge local trips
      localTrips.forEach((t: TripWithWaypoints) => {
        const companionText = t.sourceText ? (t.sourceText.match(/companions:\s*(\w+)/i)?.[1] || 'Solo') : 'Solo'
        const durationText = t.sourceText ? (t.sourceText.match(/duration:\s*(\d+)/i)?.[1] || '5') : '5'
        
        allTripsMap.set(t.id, {
          id: t.id,
          title: t.title,
          cities: t.title.toLowerCase().includes('goa') 
            ? 'Goa Coastline' 
            : t.title.toLowerCase().includes('kerala') 
              ? 'Munnar - Alleppey' 
              : t.title.toLowerCase().includes('jaipur') 
                ? 'Jaipur - Amber' 
                : 'Custom Route',
          dates: `Planned for ${durationText} Days`,
          status: t.id.startsWith('local-') ? 'Local Draft' : 'Saved',
          statusColor: t.id.startsWith('local-') ? 'bg-indigo-500' : 'bg-emerald-500',
          companions: companionText.charAt(0).toUpperCase() + companionText.slice(1),
          coverUrl: t.coverUrl || null,
          image: t.coverUrl || (t.title.toLowerCase().includes('goa') 
            ? 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=500&auto=format&fit=crop&q=80' 
            : t.title.toLowerCase().includes('kerala') 
              ? 'https://images.unsplash.com/photo-1545229765-71f08722c8cb?w=500&auto=format&fit=crop&q=80' 
              : 'https://images.unsplash.com/photo-1477587458883-471a5ed08bc4?w=500&auto=format&fit=crop&q=80'),
          createdAt: t.createdAt || new Date().toISOString()
        })
      })

      // Merge Firestore trips
      fbTrips.forEach((t: Trip) => {
        const companionText = t.sourceText ? (t.sourceText.match(/companions:\s*(\w+)/i)?.[1] || 'Solo') : 'Solo'
        const durationText = t.sourceText ? (t.sourceText.match(/duration:\s*(\d+)/i)?.[1] || '5') : '5'

        allTripsMap.set(t.id, {
          id: t.id,
          title: t.title,
          cities: t.title.toLowerCase().includes('goa') 
            ? 'Goa Coastline' 
            : t.title.toLowerCase().includes('kerala') 
              ? 'Munnar - Alleppey' 
              : t.title.toLowerCase().includes('jaipur') 
                ? 'Jaipur - Amber' 
                : 'Custom Route',
          dates: `Planned for ${durationText} Days`,
          status: 'Cloud Sync',
          statusColor: 'bg-indigo-600 bg-gradient-to-r from-indigo-600 to-indigo-700',
          companions: companionText.charAt(0).toUpperCase() + companionText.slice(1),
          coverUrl: t.coverUrl || null,
          image: t.coverUrl || (t.title.toLowerCase().includes('goa') 
            ? 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=500&auto=format&fit=crop&q=80' 
            : t.title.toLowerCase().includes('kerala') 
              ? 'https://images.unsplash.com/photo-1545229765-71f08722c8cb?w=500&auto=format&fit=crop&q=80' 
              : 'https://images.unsplash.com/photo-1477587458883-471a5ed08bc4?w=500&auto=format&fit=crop&q=80'),
          createdAt: t.createdAt || new Date().toISOString()
        })
      })

      // Sort by createdAt desc
      const sorted = Array.from(allTripsMap.values()).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )

      setTripsList(sorted)
      setLoadingTrips(false)
    }

    loadTrips()
  }, [user])

  return (
    <ProtectedRoute>
      <div className="w-full min-h-screen bg-slate-50 dark:bg-slate-950 pb-20 flex flex-col">
        {/* Header */}
        <header className="sticky top-0 z-40 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md px-4 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h1 className="text-base font-bold text-slate-800 dark:text-slate-100">My Trips</h1>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">Your upcoming Indian adventures</p>
          </div>
          <Link href="/create">
            <button className="h-8 w-8 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center shadow-md shadow-indigo-200 dark:shadow-none transition-colors">
              <Plus className="h-4 w-4" />
            </button>
          </Link>
        </header>

        {/* Main Content */}
        <div className="p-4 flex-1 flex flex-col">
          {loadingTrips ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6">
              <div className="h-8 w-8 rounded-full border-2 border-indigo-600/20 border-t-indigo-600 animate-spin" />
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-3">Loading trips...</p>
            </div>
          ) : tripsList.length > 0 ? (
            <div className="space-y-4">
              {tripsList.map((trip) => (
                <div
                  key={trip.id}
                  className="bg-white dark:bg-slate-900 rounded-2xl overflow-hidden border border-slate-100 dark:border-slate-800/85 shadow-[0_4px_12px_rgba(0,0,0,0.015)] dark:shadow-none flex flex-col animate-fade-in"
                >
                  {/* Horizontal Layout Card */}
                  <div className="flex p-3 gap-3">
                    <img
                      src={trip.image}
                      alt={trip.title}
                      className="h-20 w-20 rounded-xl object-cover shrink-0"
                    />
                    <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <h2 className="font-bold text-xs text-slate-800 dark:text-slate-100 truncate">{trip.title}</h2>
                          <span className={`px-2 py-0.5 rounded-full text-[8px] font-bold text-white shrink-0 flex items-center gap-1 ${trip.statusColor}`}>
                            {trip.status}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 text-[10px] text-slate-400 mt-1">
                          <MapPin className="h-3 w-3 text-slate-400 shrink-0" />
                          <span className="truncate">{trip.cities}</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[9px] text-slate-450 mt-1">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="h-3 w-3" />
                          <span>{trip.dates}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          <span>{trip.companions}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Bottom Card Action Bar */}
                  <div className="border-t border-slate-50 dark:border-slate-800/40 bg-slate-50/50 dark:bg-slate-900/40 flex items-center justify-between">
                    <Link href={`/my-trips/${trip.id}`} className="flex-grow">
                      <div className="px-3 py-2 flex items-center justify-between cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors">
                        <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400">View Detailed Itinerary</span>
                        <ChevronRight className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                      </div>
                    </Link>
                    
                    {/* Delete Action Button */}
                    <button
                      onClick={() => openDeleteConfirm(trip.id)}
                      className="px-3 py-2 border-l border-slate-50 dark:border-slate-800/40 hover:bg-rose-50 dark:hover:bg-rose-900/20 text-rose-600 dark:text-rose-400 transition-colors cursor-pointer shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
              <div className="h-16 w-16 rounded-full bg-slate-100 dark:bg-slate-900 flex items-center justify-center mb-4 text-slate-400">
                <Compass className="h-8 w-8" />
              </div>
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">No trips planned yet</h3>
              <p className="text-xs text-slate-450 mt-1 max-w-[220px]">Let our AI customize a beautiful route through India for you.</p>
              <Link href="/create" className="mt-5">
                <button className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs px-5 py-2.5 rounded-xl shadow-md shadow-indigo-100">
                  Plan My First Trip
                </button>
              </Link>
            </div>
          )}
        </div>

        {/* Delete Confirmation Modal */}
        {showDeleteModal && (
          <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-6 animate-fade-in">
            <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[28px] p-6 max-w-sm w-full text-center shadow-xl animate-scale-in">
              <div className="h-12 w-12 rounded-full bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto mb-4">
                <Trash2 className="h-6 w-6" />
              </div>
              <h3 className="font-extrabold text-sm text-slate-800 dark:text-slate-100">Delete this itinerary?</h3>
              <p className="text-xs text-slate-450 dark:text-slate-400 mt-2 leading-relaxed">This action cannot be undone. This trip will be permanently deleted from your saved journeys.</p>
              
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => { setShowDeleteModal(false); setTripToDelete(null); }}
                  disabled={deleting}
                  className="flex-grow h-10 border border-slate-100 dark:border-slate-800 text-slate-600 dark:text-slate-400 text-xs font-bold rounded-xl hover:bg-slate-50 dark:hover:bg-slate-900 transition-all disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-grow h-10 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl flex items-center justify-center transition-all disabled:opacity-50"
                >
                  {deleting ? (
                    <div className="h-4 w-4 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                  ) : (
                    'Delete'
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ProtectedRoute>
  )
}
