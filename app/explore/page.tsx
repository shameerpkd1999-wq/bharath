'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Compass, Search, Sparkles, MapPin, Copy, CheckCircle2, User } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { db } from '@/lib/firebase'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { Trip, Waypoint, TripWithWaypoints } from '@/types/travel'

// Preseeded public community trips to keep the feed populated and gorgeous
const PRESEEDED_COMMUNITY_TRIPS: TripWithWaypoints[] = [
  {
    id: 'community-seed-1',
    userId: 'system-1',
    userName: 'Aarav Sharma',
    title: 'Vibrant Rajasthan Cultural Tour',
    isPublic: true,
    sourceText: 'Jaipur, Amer Fort, Hawa Mahal, City Palace',
    createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
    waypoints: [
      {
        id: 'seed-wp-1',
        placeName: 'Hawa Mahal (Palace of Winds)',
        order: 1,
        durationMin: 60,
        foodSpots: ['Laxmi Mishthan Bhandar', 'Wind View Cafe'],
        photoPoints: ['Hawa Mahal facade from street level'],
        lat: 26.9239,
        lng: 75.8267
      },
      {
        id: 'seed-wp-2',
        placeName: 'Amer Fort & Palace',
        order: 2,
        durationMin: 180,
        foodSpots: ['1135 AD Restaurant', 'Amer Kulfi'],
        photoPoints: ['Sheesh Mahal mirror reflections'],
        lat: 26.9855,
        lng: 75.8513
      },
      {
        id: 'seed-wp-3',
        placeName: 'City Palace Jaipur',
        order: 3,
        durationMin: 120,
        foodSpots: ['The Baradari Restaurant', 'Local Kachori Stall'],
        photoPoints: ['Peacock Gate courtyard'],
        lat: 26.9258,
        lng: 75.8237
      }
    ]
  },
  {
    id: 'community-seed-2',
    userId: 'system-2',
    userName: 'Diya Menon',
    title: 'Kerala Backwaters & Tea Gardens Escapade',
    isPublic: true,
    sourceText: 'Alleppey, Munnar',
    createdAt: new Date(Date.now() - 86400000 * 1).toISOString(),
    waypoints: [
      {
        id: 'seed-wp-4',
        placeName: 'Alleppey Houseboat Station',
        order: 1,
        durationMin: 240,
        foodSpots: ['Vembanad Seafood', 'Local Toddy Shop Fish Curry'],
        photoPoints: ['Sunset view over Vembanad canals'],
        lat: 9.4981,
        lng: 76.3388
      },
      {
        id: 'seed-wp-5',
        placeName: 'Munnar Tea Estates & Museum',
        order: 2,
        durationMin: 180,
        foodSpots: ['Saravana Bhavan Munnar', 'Tea Stall Banana Fritters'],
        photoPoints: ['Lush tea garden green carpets'],
        lat: 10.0889,
        lng: 77.0595
      }
    ]
  },
  {
    id: 'community-seed-3',
    userId: 'system-3',
    userName: 'Rohan D Souza',
    title: 'Sunny Goa Beach & Churches Getaway',
    isPublic: true,
    sourceText: 'Old Goa, Baga Beach',
    createdAt: new Date(Date.now() - 3600000 * 5).toISOString(),
    waypoints: [
      {
        id: 'seed-wp-6',
        placeName: 'Basilica of Bom Jesus (Old Goa)',
        order: 1,
        durationMin: 90,
        foodSpots: ['Viva Panjim', 'Bom Jesus Coconut Water Stall'],
        photoPoints: ['Baroque facade of Basilica'],
        lat: 15.5009,
        lng: 73.9116
      },
      {
        id: 'seed-wp-7',
        placeName: 'Baga Coastline & Beach',
        order: 2,
        durationMin: 180,
        foodSpots: ['Britto’s Beach Shack', 'Local Goan Fish Thali'],
        photoPoints: ['Sunset views from Baga cliffs'],
        lat: 15.5539,
        lng: 73.7551
      }
    ]
  }
]

// Helper functions defined outside the React component to satisfy React 19 compiler purity checks
const generateClonedTripId = (): string => 'cloned-trip-' + Date.now()
const generateNewTimestamp = (): string => new Date().toISOString()
const generateClonedWaypointId = (clonedTripId: string, index: number): string => `cloned-wp-${clonedTripId}-${index}`

export default function ExplorePage() {
  const { user } = useAuth()
  const router = useRouter()

  const [trips, setTrips] = useState<TripWithWaypoints[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [cloningId, setCloningId] = useState<string | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  const categories = ['All', 'Cultural', 'Nature', 'Heritage', 'Adventure']

  useEffect(() => {
    async function fetchPublicTrips() {
      setLoading(true)
      let list: TripWithWaypoints[] = []
      
      try {
        const q = query(
          collection(db, 'trips'),
          where('isPublic', '==', true)
        )
        const snap = await getDocs(q)
        
        // Fetch waypoints in parallel for each trip to get correct stops
        const fetched = await Promise.all(
          snap.docs.map(async (docSnap) => {
            const tripData = docSnap.data()
            const wpSnap = await getDocs(collection(db, 'trips', docSnap.id, 'waypoints'))
            const waypoints: Waypoint[] = []
            wpSnap.forEach((wpDoc) => {
              waypoints.push({ id: wpDoc.id, ...wpDoc.data() } as Waypoint)
            })
            return {
              id: docSnap.id,
              ...tripData,
              waypoints: waypoints.sort((a, b) => a.order - b.order)
            } as TripWithWaypoints
          })
        )
        list = fetched
      } catch (err) {
        console.warn('⚠️ Could not fetch community public trips from Firestore (database might be disabled/uninitialized):', err)
      }

      // Read public local trips from localStorage
      let localPublic: TripWithWaypoints[] = []
      try {
        const localTripsStr = localStorage.getItem('local_trips') || '[]'
        const parsed = JSON.parse(localTripsStr)
        localPublic = parsed.filter((t: TripWithWaypoints) => t.isPublic === true)
      } catch (err) {
        console.error('Failed to load local public trips:', err)
      }

      // Merge and de-duplicate by ID
      const allTripsMap = new Map<string, TripWithWaypoints>()
      
      // Merge preseeded community trips
      PRESEEDED_COMMUNITY_TRIPS.forEach(t => allTripsMap.set(t.id, t))
      // Merge local public trips
      localPublic.forEach(t => allTripsMap.set(t.id, t))
      // Merge Firestore public trips
      list.forEach(t => allTripsMap.set(t.id, t))

      // Sort all public trips by createdAt desc (showing public posts from all accounts)
      const sorted = Array.from(allTripsMap.values())
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

      setTrips(sorted)
      setLoading(false)
    }

    fetchPublicTrips()
  }, [user])

  const handleClone = useCallback(async (sourceTrip: TripWithWaypoints) => {
    if (!user) {
      router.push('/auth')
      return
    }

    setCloningId(sourceTrip.id)
    const clonedTripId = generateClonedTripId()
    const newTimestamp = generateNewTimestamp()

    // 1. Compile cloned trip data
    const clonedTripData = {
      userId: user.uid,
      userName: user.displayName || 'Traveler',
      title: `${sourceTrip.title} (Cloned)`,
      isPublic: false,
      sourceText: sourceTrip.sourceText || '',
      createdAt: newTimestamp,
      coverUrl: sourceTrip.coverUrl || null
    }

    const clonedWaypoints = sourceTrip.waypoints.map((wp: Waypoint, index: number) => ({
      id: generateClonedWaypointId(clonedTripId, index),
      placeName: wp.placeName,
      order: wp.order,
      durationMin: wp.durationMin || 90,
      foodSpots: wp.foodSpots || [],
      photoPoints: wp.photoPoints || [],
      lat: wp.lat || 0,
      lng: wp.lng || 0
    }))

    // 1. Persist to localStorage first (instant & reliable fallback)
    try {
      const localTripsStr = localStorage.getItem('local_trips') || '[]'
      const localTrips = JSON.parse(localTripsStr)
      localTrips.push({
        id: clonedTripId,
        ...clonedTripData,
        waypoints: clonedWaypoints
      })
      localStorage.setItem('local_trips', JSON.stringify(localTrips))
    } catch (err) {
      console.error('Failed to save cloned trip to localStorage:', err)
    }

    // 2. Persist to Firestore in the background (non-blocking)
    import('firebase/firestore').then(async ({ doc, setDoc }) => {
      try {
        const tripRef = doc(db, 'trips', clonedTripId)
        await setDoc(tripRef, clonedTripData)
        for (const wp of clonedWaypoints) {
          const wpRef = doc(db, 'trips', clonedTripId, 'waypoints', wp.id)
          await setDoc(wpRef, {
            id: wp.id,
            placeName: wp.placeName,
            order: wp.order,
            durationMin: wp.durationMin,
            foodSpots: wp.foodSpots,
            photoPoints: wp.photoPoints,
            lat: wp.lat,
            lng: wp.lng
          })
        }
      } catch (err) {
        console.warn('⚠️ Background Firestore sync for cloned trip failed:', err)
      }
    }).catch(err => console.error('Failed to import firestore module:', err))

    // Show success toast and redirect
    setToastMessage('Trip cloned successfully! Redirecting...')
    setTimeout(() => {
      setToastMessage(null)
      setCloningId(null)
      router.push('/my-trips')
    }, 1500)
  }, [user, router])

  // Filter public feed cards
  const filteredTrips = trips.filter(t => {
    const matchesSearch = t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          t.userName.toLowerCase().includes(searchQuery.toLowerCase())
    
    if (selectedCategory === 'All') return matchesSearch
    
    // Categorization logic based on text queries
    const text = t.title.toLowerCase()
    if (selectedCategory === 'Cultural' && (text.includes('heritage') || text.includes('cultural') || text.includes('rajasthan'))) return matchesSearch
    if (selectedCategory === 'Nature' && (text.includes('kerala') || text.includes('backwaters') || text.includes('tea'))) return matchesSearch
    if (selectedCategory === 'Heritage' && (text.includes('triangle') || text.includes('monument') || text.includes('agra') || text.includes('heritage'))) return matchesSearch
    if (selectedCategory === 'Adventure' && (text.includes('beach') || text.includes('goa') || text.includes('trek'))) return matchesSearch
    
    return false
  })

  // Cover image utility helper
  const getCoverImage = (tripItem: Trip) => {
    if (tripItem.coverUrl) return tripItem.coverUrl

    const title = tripItem.title || ''
    const lTitle = title.toLowerCase()
    if (lTitle.includes('goa')) return 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=500&auto=format&fit=crop&q=80'
    if (lTitle.includes('kerala')) return 'https://images.unsplash.com/photo-1593693397690-362cb9666fc2?w=500&auto=format&fit=crop&q=80'
    if (lTitle.includes('jaipur') || lTitle.includes('rajasthan')) return 'https://images.unsplash.com/photo-1477587458883-471a5ed08bc4?w=500&auto=format&fit=crop&q=80'
    return 'https://images.unsplash.com/photo-1564507592333-c60657eea523?w=500&auto=format&fit=crop&q=80'
  }

  return (
    <div className="w-full min-h-screen bg-slate-50 dark:bg-slate-950 pb-20 flex flex-col relative">
      
      {/* Toast Notification */}
      {toastMessage && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 bg-slate-900/90 backdrop-blur-md text-white text-xs font-bold px-4 py-2.5 rounded-full shadow-lg flex items-center gap-2 animate-fade-in whitespace-nowrap border border-white/5">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}
      {/* Sticky Header */}
      <header className="sticky top-0 z-40 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md px-4 pt-3 pb-2 border-b border-slate-100 dark:border-slate-800 shrink-0 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-indigo-600 bg-gradient-to-tr from-indigo-600 to-indigo-700 flex items-center justify-center text-white shadow-md shadow-indigo-200 dark:shadow-none">
              <Compass className="h-5 w-5 animate-spin-slow" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight text-slate-800 dark:text-slate-100">Explore Feed</h1>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">Discover public routes in India</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100/40 dark:border-emerald-900/30">
            <Sparkles className="h-3 w-3 text-emerald-600 dark:text-emerald-450 animate-pulse" />
            <span className="text-[9px] font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">Social Feed</span>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search trips or creators..."
            className="w-full h-10 pl-9 pr-4 text-xs bg-slate-100 dark:bg-slate-800 border-none rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/35 transition-all text-slate-800 dark:text-slate-100 font-medium"
          />
        </div>

        {/* Horizontal Category Scroll (Sticky inside header) */}
        <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1.5 -mx-4 px-4">
          {categories.map((category) => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-200 ${
                selectedCategory === category
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-100'
                  : 'bg-white dark:bg-slate-900 text-slate-650 dark:text-slate-400 border border-slate-100 dark:border-slate-800'
              }`}
            >
              {category}
            </button>
          ))}
        </div>
      </header>

      {/* Main Content Area */}
      <div className="p-4 pt-2 flex-1 flex flex-col overflow-y-auto">

        {/* Dynamic Card Feed */}
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6">
            <div className="h-8 w-8 rounded-full border-2 border-indigo-600/20 border-t-indigo-600 animate-spin" />
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-3">Loading Community...</p>
          </div>
        ) : filteredTrips.length > 0 ? (
          <div className="space-y-5">
            {filteredTrips.map((tripItem) => (
              <div
                key={tripItem.id}
                className="bg-white dark:bg-slate-900 rounded-[24px] overflow-hidden border border-slate-100 dark:border-slate-800/80 shadow-[0_4px_12px_rgba(0,0,0,0.015)] dark:shadow-none flex flex-col animate-fade-in"
              >
                {/* Cover Banner */}
                <div className="relative h-40 w-full shrink-0">
                  <img
                    src={getCoverImage(tripItem)}
                    alt={tripItem.title}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-3 right-3 bg-indigo-600/80 backdrop-blur-md px-2.5 py-1 rounded-full text-[9px] font-extrabold text-white flex items-center gap-1 shadow-sm">
                    <Sparkles className="h-2.5 w-2.5" />
                    {tripItem.waypoints?.length || 0} Stops
                  </div>
                </div>

                {/* Card Detail Section */}
                <div className="p-4 flex flex-col gap-3">
                  {/* Creator Info */}
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 shrink-0">
                      <User className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <span className="block text-[10px] font-bold text-slate-800 dark:text-slate-200 truncate">{tripItem.userName}</span>
                      <span className="block text-[8px] text-slate-400 font-semibold uppercase mt-0.5">Community Planner</span>
                    </div>
                  </div>

                  {/* Trip Details */}
                  <div>
                    <h3 className="font-extrabold text-sm text-slate-800 dark:text-slate-100 leading-tight">{tripItem.title}</h3>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 max-w-xs truncate leading-normal">
                      Places: {tripItem.waypoints?.map((w: Waypoint) => w.placeName).join(' ➔ ') || 'Custom Route'}
                    </p>
                  </div>

                  {/* Accordion List of Waypoint Stops */}
                  {tripItem.waypoints && tripItem.waypoints.length > 0 && (
                    <div className="mt-1 pt-3 border-t border-slate-50 dark:border-slate-800/40">
                      <div className="flex items-center gap-1.5 text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">
                        <MapPin className="h-3 w-3 text-indigo-500" />
                        Itinerary Stops
                      </div>
                      <div className="space-y-1.5 pl-1.5">
                        {tripItem.waypoints.map((wp: Waypoint) => (
                          <div key={wp.id} className="flex items-center gap-2 text-[10px] text-slate-600 dark:text-slate-350">
                            <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 shrink-0" />
                            <span className="font-bold text-slate-700 dark:text-slate-300">Stop {wp.order}:</span>
                            <span className="truncate">{wp.placeName}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Cloning CTA Button */}
                  <div className="mt-3 pt-3 border-t border-slate-50 dark:border-slate-800/40">
                    <button
                      onClick={() => handleClone(tripItem)}
                      disabled={cloningId !== null}
                      className="w-full h-10 bg-indigo-600 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-sm transition-all hover:opacity-90 active:scale-95 disabled:opacity-50"
                    >
                      {cloningId === tripItem.id ? (
                        <div className="h-4 w-4 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          Clone Itinerary
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
            <div className="h-16 w-16 rounded-full bg-slate-100 dark:bg-slate-900 flex items-center justify-center mb-4 text-slate-450">
              <Compass className="h-8 w-8 text-slate-400" />
            </div>
            <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">No public trips matching your search</h3>
            <p className="text-xs text-slate-450 mt-1 max-w-[220px]">Try searching another keyword or create a new public journey.</p>
          </div>
        )}
      </div>
    </div>
  )
}
