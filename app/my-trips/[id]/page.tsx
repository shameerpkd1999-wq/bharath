'use client'

import React, { useEffect, useState, use } from 'react'
import { geocodePlace, getPlaceSuggestions, PlaceSuggestion, reverseGeocode } from '@/app/actions/geocode'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, MapPin, Clock, Utensils, Camera, Share2, Compass, Sparkles, Trash2, Plus, Search, Loader2, Navigation } from 'lucide-react'
import ProtectedRoute from '@/components/ProtectedRoute'
import { db } from '@/lib/firebase'
import { doc, getDoc, collection, getDocs, orderBy, query } from 'firebase/firestore'
import { Trip, Waypoint } from '@/types/travel'
import dynamic from 'next/dynamic'

interface TripDetail extends Trip {
  waypoints: Waypoint[]
}

// Dynamically import Leaflet Map component with SSR disabled
const ItineraryMap = dynamic(() => import('@/components/ItineraryMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-slate-100 dark:bg-slate-900">
      <div className="h-7 w-7 rounded-full border-2 border-indigo-600/20 border-t-indigo-600 animate-spin" />
    </div>
  )
})

// Specific coordinates for iconic monuments and spots to bypass Nominatim queries or resolve overlaps
const SPECIFIC_PLACE_COORDINATES: { [key: string]: { lat: number; lng: number } } = {
  'tajmahal': { lat: 27.1751, lng: 78.0421 },
  'redfort': { lat: 28.6562, lng: 77.2410 },
  'qutubminar': { lat: 28.5245, lng: 77.1855 },
  'indiagate': { lat: 28.6129, lng: 77.2295 },
  'lotustemple': { lat: 28.5535, lng: 77.2588 },
  'chandnichowk': { lat: 28.6506, lng: 77.2303 },
  'agrafort': { lat: 27.1795, lng: 78.0211 },
  'hawamahal': { lat: 26.9239, lng: 75.8267 },
  'amerfort': { lat: 26.9855, lng: 75.8513 },
  'amberfort': { lat: 26.9855, lng: 75.8513 },
  'citypalace': { lat: 26.9258, lng: 75.8237 },
  'jantarmantar': { lat: 26.9248, lng: 75.8245 },
  'jalmahal': { lat: 26.9534, lng: 75.8462 },
  'alleppeyhouseboat': { lat: 9.4981, lng: 76.3388 },
  'vembanad': { lat: 9.5981, lng: 76.3533 },
  'munnartea': { lat: 10.0889, lng: 77.0595 },
  'lockhart': { lat: 10.0450, lng: 77.1630 },
  'mattupetty': { lat: 10.1060, lng: 77.1245 },
  'bomjesus': { lat: 15.5009, lng: 73.9116 },
  'bagabeach': { lat: 15.5539, lng: 73.7551 },
  'calangute': { lat: 15.5442, lng: 73.7624 },
  'anjuna': { lat: 15.5733, lng: 73.7410 },
  'panaji': { lat: 15.4909, lng: 73.8278 },
  'ootylake': { lat: 11.4084, lng: 76.6874 },
  'botanicalgardens': { lat: 11.4190, lng: 76.7118 },
  'doddabetta': { lat: 11.4294, lng: 76.7370 },
  'pykara': { lat: 11.5300, lng: 76.6000 },
  'kodaikanallake': { lat: 10.2325, lng: 77.4860 },
  'coakerswalk': { lat: 10.2330, lng: 77.4925 },
  'pillarrocks': { lat: 10.1936, lng: 77.4764 },
  'pineforest': { lat: 10.2030, lng: 77.4780 },
  'connaughtplace': { lat: 28.6304, lng: 77.2177 },
  'lodigardens': { lat: 28.5900, lng: 77.2200 },
  'nationalmuseum': { lat: 28.6118, lng: 77.2193 },
  'akshardham': { lat: 28.6127, lng: 77.2773 },
  'jamamasjid': { lat: 28.6507, lng: 77.2334 },
  'rajghat': { lat: 28.6406, lng: 77.2495 },
  'galtaji': { lat: 26.9158, lng: 75.8583 },
  'alberthall': { lat: 26.9116, lng: 75.8195 },
  'birlamandir': { lat: 26.8924, lng: 75.8153 },
  'patrikagate': { lat: 26.8530, lng: 75.7958 },
  'chokhidhani': { lat: 26.7667, lng: 75.8333 },
  'pannameena': { lat: 26.9880, lng: 75.8538 },
  'varkala': { lat: 8.7302, lng: 76.7118 },
  'kovalam': { lat: 8.4004, lng: 76.9787 },
  'athirappilly': { lat: 10.2851, lng: 76.5698 },
  'periyar': { lat: 9.4679, lng: 77.1437 },
  'bekalfort': { lat: 12.3925, lng: 75.0354 },
  'edakkal': { lat: 11.6262, lng: 76.2348 },
  'banasurasagar': { lat: 11.6672, lng: 75.9547 },
  'poovar': { lat: 8.3182, lng: 77.0700 },
  'dudhsagar': { lat: 15.3184, lng: 74.3140 },
  'caborama': { lat: 15.0883, lng: 73.9189 },
  'arambol': { lat: 15.6875, lng: 73.7042 },
  'morjim': { lat: 15.6186, lng: 73.7297 },
  'donapaula': { lat: 15.4533, lng: 73.8058 },
  'mangeshi': { lat: 15.4439, lng: 73.9681 },
  'rosegarden': { lat: 11.4070, lng: 76.7130 },
  'nilgirimountain': { lat: 11.3200, lng: 76.8200 },
  'toytrain': { lat: 11.3200, lng: 76.8200 },
  'emeraldlake': { lat: 11.3265, lng: 76.6237 },
  'avalanche': { lat: 11.2900, lng: 76.5900 },
  'gunacaves': { lat: 10.1995, lng: 77.4870 },
  'mannavanur': { lat: 10.2220, lng: 77.3520 },
  'jaigarhfort': { lat: 26.9850, lng: 75.8456 },
  'nahargarhfort': { lat: 26.9374, lng: 75.8156 },
  'sisodiaranigarden': { lat: 26.8988, lng: 75.8647 },
  'sisodiaranipalace': { lat: 26.8988, lng: 75.8647 },
  'sisodiaranikabagh': { lat: 26.8988, lng: 75.8647 },
  'joharibazaar': { lat: 26.9200, lng: 75.8280 },
  'joharibazar': { lat: 26.9200, lng: 75.8280 },
  'bapubazaar': { lat: 26.9150, lng: 75.8250 },
  'bapubazar': { lat: 26.9150, lng: 75.8250 },
  'masalachowk': { lat: 26.8990, lng: 75.8175 },
  'anokhi': { lat: 26.9927, lng: 75.8508 },
  'govinddevji': { lat: 26.9288, lng: 75.8240 }
}

// Fallback general coordinates for cities
const CITY_COORDINATES: { [key: string]: { lat: number; lng: number } } = {
  delhi: { lat: 28.6139, lng: 77.2090 },
  newdelhi: { lat: 28.6139, lng: 77.2090 },
  agra: { lat: 27.1767, lng: 78.0081 },
  jaipur: { lat: 26.9124, lng: 75.7873 },
  rajasthan: { lat: 26.9124, lng: 75.7873 },
  munnar: { lat: 10.0889, lng: 77.0595 },
  alleppey: { lat: 9.4981, lng: 76.3388 },
  kochi: { lat: 9.9312, lng: 76.2673 },
  kodaikanal: { lat: 10.2381, lng: 77.4892 },
  ooty: { lat: 11.4102, lng: 76.6950 },
  goa: { lat: 15.2993, lng: 74.1240 },
  mumbai: { lat: 19.0760, lng: 72.8777 },
  bangalore: { lat: 12.9716, lng: 77.5946 },
  hampi: { lat: 15.3350, lng: 76.4600 },
}

// Cleaned search and cascade coordinate resolver
async function resolveCoordinates(placeName: string, cityContext?: string): Promise<{ lat: number; lng: number }> {
  // Strip parentheses and brackets for clean Nominatim geocoding searches
  const cleanNameForSearch = placeName
    .replace(/\(.*?\)/g, '')
    .replace(/\[.*?\]/g, '')
    .trim()

  const normalizedKey = cleanNameForSearch.toLowerCase().replace(/[^a-z0-9]/g, '')

  // 1. Try specific landmarks first to yield pinpoint accuracy
  for (const [key, coords] of Object.entries(SPECIFIC_PLACE_COORDINATES)) {
    if (normalizedKey.includes(key)) {
      return coords
    }
  }

  // 2. Query Nominatim API with the clean name in India (server-side via action to bypass CORS)
  try {
    const searchQuery = cityContext 
      ? `${cleanNameForSearch}, ${cityContext}`
      : cleanNameForSearch
    const coords = await geocodePlace(searchQuery)
    if (coords && !isNaN(coords.lat) && !isNaN(coords.lng)) {
      return coords
    }
  } catch (err) {
    console.warn(`Server-side geocoding failed for "${cleanNameForSearch}":`, err)
  }

  // 3. Fallback to general city coordinates if Nominatim returned empty results
  for (const [key, coords] of Object.entries(CITY_COORDINATES)) {
    if (normalizedKey.includes(key)) {
      return coords
    }
  }

  // 3.5. Fallback to city center if cityContext is provided
  if (cityContext) {
    const cityKey = cityContext.toLowerCase().replace(/[^a-z0-9]/g, '')
    if (CITY_COORDINATES[cityKey]) {
      return CITY_COORDINATES[cityKey]
    }
  }

  // 4. Default center of India coordinate
  return { lat: 20.5937, lng: 78.9629 }
}

function generateWpId(id: string, count: number): string {
  return `wp-${id}-${Date.now()}-${count}`
}

function formatDuration(mins: number, travelMode: 'driving' | 'two-wheeler' | 'walking'): string {
  const actualMins = travelMode === 'two-wheeler' ? mins * 0.75 : mins
  if (actualMins < 1) return 'Less than a min'
  const hrs = Math.floor(actualMins / 60)
  const remainingMins = Math.round(actualMins % 60)
  if (hrs > 0) {
    if (remainingMins === 0) return `${hrs} hr${hrs > 1 ? 's' : ''}`
    return `${hrs} hr${hrs > 1 ? 's' : ''} ${remainingMins} min${remainingMins !== 1 ? 's' : ''}`
  }
  return `${remainingMins} min${remainingMins !== 1 ? 's' : ''}`
}

export default function TripDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const resolvedParams = use(params)
  const id = resolvedParams.id

  const [trip, setTrip] = useState<TripDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [activeWaypointId, setActiveWaypointId] = useState<string | null>(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [searchVal, setSearchVal] = useState('')
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([])
  const [searchingSuggestions, setSearchingSuggestions] = useState(false)
  const [travelMode, setTravelMode] = useState<'driving' | 'two-wheeler' | 'walking'>('driving')
  const [routeInfo, setRouteInfo] = useState<{ distanceKm: number; durationMin: number } | null>(null)
  const [locatingCurrent, setLocatingCurrent] = useState(false)
  const [startTrip, setStartTrip] = useState(false)

  const handleSearchChange = (val: string) => {
    setSearchVal(val)
    if (val.trim().length < 3) {
      setSuggestions([])
    }
  }

  // Debounced real-time suggestions for adding a stop
  useEffect(() => {
    if (searchVal.trim().length < 3) {
      return
    }

    const delayDebounce = setTimeout(async () => {
      setSearchingSuggestions(true)
      try {
        const data = await getPlaceSuggestions(searchVal)
        setSuggestions(data)
      } catch (err) {
        console.error('Autocomplete search failed:', err)
      } finally {
        setSearchingSuggestions(false)
      }
    }, 400)

    return () => clearTimeout(delayDebounce)
  }, [searchVal])

  const handleDelete = async () => {
    setDeleting(true)
    
    // A. Delete from Firestore (non-blocking if Firestore is disabled)
    try {
      const { deleteDoc, doc } = await import('firebase/firestore')
      await deleteDoc(doc(db, 'trips', id))
    } catch (err) {
      console.warn('Could not delete trip from Firestore:', err)
    }

    // B. Delete from localStorage
    try {
      const localTripsStr = localStorage.getItem('local_trips') || '[]'
      const localTrips: TripDetail[] = JSON.parse(localTripsStr)
      const updatedTrips = localTrips.filter((t) => t.id !== id)
      localStorage.setItem('local_trips', JSON.stringify(updatedTrips))
    } catch (err) {
      console.error('Error deleting trip from localStorage:', err)
    }

    setDeleting(false)
    setShowDeleteModal(false)
    router.push('/my-trips')
  }

  const handleDeleteWaypoint = async (wpId: string) => {
    if (!trip) return

    const updatedWaypoints = trip.waypoints
      .filter((wp) => wp.id !== wpId)
      .map((wp, idx) => ({
        ...wp,
        order: idx + 1,
      }))

    const updatedTrip = {
      ...trip,
      waypoints: updatedWaypoints,
    }

    setTrip(updatedTrip)

    if (activeWaypointId === wpId) {
      setActiveWaypointId(updatedWaypoints.length > 0 ? updatedWaypoints[0].id : null)
    }

    // Save to localStorage
    try {
      const localTripsStr = localStorage.getItem('local_trips') || '[]'
      const localTrips: TripDetail[] = JSON.parse(localTripsStr)
      const idx = localTrips.findIndex((t) => t.id === id)
      if (idx !== -1) {
        localTrips[idx].waypoints = updatedWaypoints
        localStorage.setItem('local_trips', JSON.stringify(localTrips))
      }
    } catch (err) {
      console.error('Error saving updated waypoints to localStorage:', err)
    }

    // Sync deletion to Firestore
    try {
      const { deleteDoc, doc, getDoc, setDoc, writeBatch } = await import('firebase/firestore')
      
      const tripRef = doc(db, 'trips', id)
      const tripSnap = await getDoc(tripRef)
      
      if (!tripSnap.exists()) {
        // Self-healing: Sync the whole trip and its remaining waypoints if missing from Firestore
        await setDoc(tripRef, {
          userId: trip.userId,
          userName: trip.userName,
          title: trip.title,
          isPublic: trip.isPublic,
          sourceText: trip.sourceText,
          createdAt: trip.createdAt,
          isMock: trip.isMock || null,
          geminiError: trip.geminiError || null
        })
        
        for (const wp of updatedWaypoints) {
          const wpRef = doc(db, 'trips', id, 'waypoints', wp.id)
          await setDoc(wpRef, wp)
        }
      } else {
        // Otherwise, perform standard deletion and order updates
        await deleteDoc(doc(db, 'trips', id, 'waypoints', wpId))

        const batch = writeBatch(db)
        updatedWaypoints.forEach((wp) => {
          const wpRef = doc(db, 'trips', id, 'waypoints', wp.id)
          batch.update(wpRef, { order: wp.order })
        })
        await batch.commit()
      }
    } catch (err) {
      console.warn('Firestore sync failed for waypoint deletion:', err)
    }
  }

  const handleAddWaypoint = async (place: PlaceSuggestion) => {
    if (!trip) return

    const newWpId = generateWpId(id, trip.waypoints.length)
    const newWpOrder = trip.waypoints.length + 1

    const newWaypoint: Waypoint = {
      id: newWpId,
      placeName: place.display_name.split(',')[0] || place.display_name,
      order: newWpOrder,
      durationMin: 90,
      foodSpots: [],
      photoPoints: [],
      lat: parseFloat(String(place.lat)) || 20.5937,
      lng: parseFloat(String(place.lon)) || 78.9629
    }

    const updatedWaypoints = [...trip.waypoints, newWaypoint]
    const updatedTrip = {
      ...trip,
      waypoints: updatedWaypoints
    }

    setTrip(updatedTrip)
    setActiveWaypointId(newWpId)
    setSearchVal('')
    setSuggestions([])

    // Save to localStorage
    try {
      const localTripsStr = localStorage.getItem('local_trips') || '[]'
      const localTrips: TripDetail[] = JSON.parse(localTripsStr)
      const idx = localTrips.findIndex((t) => t.id === id)
      if (idx !== -1) {
        localTrips[idx].waypoints = updatedWaypoints
        localStorage.setItem('local_trips', JSON.stringify(localTrips))
      }
    } catch (err) {
      console.error('Error adding waypoint to localStorage:', err)
    }

    // Save to Firestore
    try {
      const { doc, getDoc, setDoc } = await import('firebase/firestore')
      
      const tripRef = doc(db, 'trips', id)
      const tripSnap = await getDoc(tripRef)
      
      if (!tripSnap.exists()) {
        // Self-healing: Sync the whole trip and its waypoints if missing from Firestore
        await setDoc(tripRef, {
          userId: trip.userId,
          userName: trip.userName,
          title: trip.title,
          isPublic: trip.isPublic,
          sourceText: trip.sourceText,
          createdAt: trip.createdAt,
          isMock: trip.isMock || null,
          geminiError: trip.geminiError || null
        })
        
        for (const wp of updatedWaypoints) {
          const wpRef = doc(db, 'trips', id, 'waypoints', wp.id)
          await setDoc(wpRef, wp)
        }
      } else {
        const wpRef = doc(db, 'trips', id, 'waypoints', newWpId)
        await setDoc(wpRef, {
          id: newWpId,
          placeName: newWaypoint.placeName,
          order: newWaypoint.order,
          durationMin: newWaypoint.durationMin,
          foodSpots: newWaypoint.foodSpots,
          photoPoints: newWaypoint.photoPoints,
          lat: newWaypoint.lat,
          lng: newWaypoint.lng
        })
      }
    } catch (err) {
      console.warn('Firestore sync failed for new waypoint:', err)
    }
  }

  const handleAddCurrentLocation = () => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      alert('Geolocation is not supported by your browser')
      return
    }

    if (!trip) return

    setLocatingCurrent(true)
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude
        const lng = position.coords.longitude

        try {
          const address = await reverseGeocode(lat, lng)
          const shortName = address.split(',')[0] || `Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`
          
          const newWpId = generateWpId(id, trip.waypoints.length)
          const newWpOrder = trip.waypoints.length + 1

          const newWaypoint: Waypoint = {
            id: newWpId,
            placeName: shortName,
            order: newWpOrder,
            durationMin: 90,
            foodSpots: [],
            photoPoints: [],
            lat,
            lng
          }

          const updatedWaypoints = [...trip.waypoints, newWaypoint]
          const updatedTrip = {
            ...trip,
            waypoints: updatedWaypoints
          }

          setTrip(updatedTrip)
          setActiveWaypointId(newWpId)

          // Save to localStorage
          try {
            const localTripsStr = localStorage.getItem('local_trips') || '[]'
            const localTrips: TripDetail[] = JSON.parse(localTripsStr)
            const idx = localTrips.findIndex((t) => t.id === id)
            if (idx !== -1) {
              localTrips[idx].waypoints = updatedWaypoints
              localStorage.setItem('local_trips', JSON.stringify(localTrips))
            }
          } catch (err) {
            console.error('Error adding waypoint to localStorage:', err)
          }

          // Save to Firestore
          try {
            const { doc, getDoc, setDoc } = await import('firebase/firestore')
            
            const tripRef = doc(db, 'trips', id)
            const tripSnap = await getDoc(tripRef)
            
            if (!tripSnap.exists()) {
              // Self-healing: Sync the whole trip and its waypoints if missing from Firestore
              await setDoc(tripRef, {
                userId: trip.userId,
                userName: trip.userName,
                title: trip.title,
                isPublic: trip.isPublic,
                sourceText: trip.sourceText,
                createdAt: trip.createdAt,
                isMock: trip.isMock || null,
                geminiError: trip.geminiError || null
              })
              
              for (const wp of updatedWaypoints) {
                const wpRef = doc(db, 'trips', id, 'waypoints', wp.id)
                await setDoc(wpRef, wp)
              }
            } else {
              const wpRef = doc(db, 'trips', id, 'waypoints', newWpId)
              await setDoc(wpRef, {
                id: newWpId,
                placeName: newWaypoint.placeName,
                order: newWaypoint.order,
                durationMin: newWaypoint.durationMin,
                foodSpots: newWaypoint.foodSpots,
                photoPoints: newWaypoint.photoPoints,
                lat,
                lng
              })
            }
          } catch (err) {
            console.warn('Firestore sync failed for new waypoint:', err)
          }

        } catch (err) {
          console.error('Reverse geocoding failed:', err)
          alert('Failed to resolve address for your current location.')
        } finally {
          setLocatingCurrent(false)
        }
      },
      (error) => {
        console.error('Geolocation query failed:', error)
        setLocatingCurrent(false)
        alert(`Failed to retrieve your location: ${error.message}`)
      },
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 0
      }
    )
  }

  const handleAddStopManually = async () => {
    if (!searchVal.trim() || !trip) return

    let cityContext = ''
    const titleLower = trip.title.toLowerCase()
    if (titleLower.includes('jaipur') || titleLower.includes('rajasthan')) cityContext = 'Jaipur'
    else if (titleLower.includes('goa')) cityContext = 'Goa'
    else if (titleLower.includes('kerala') || titleLower.includes('alleppey') || titleLower.includes('munnar')) cityContext = 'Kerala'
    else if (titleLower.includes('ooty')) cityContext = 'Ooty'
    else if (titleLower.includes('kodaikanal')) cityContext = 'Kodaikanal'
    else if (titleLower.includes('delhi')) cityContext = 'Delhi'
    else if (titleLower.includes('agra')) cityContext = 'Agra'

    const cityKey = cityContext.toLowerCase().replace(/[^a-z0-9]/g, '')
    const defaultCoords = cityContext && CITY_COORDINATES[cityKey]
      ? CITY_COORDINATES[cityKey]
      : { lat: 20.5937, lng: 78.9629 }

    const newWpId = generateWpId(id, trip.waypoints.length)
    const newWpOrder = trip.waypoints.length + 1

    const newWaypoint: Waypoint = {
      id: newWpId,
      placeName: searchVal.trim(),
      order: newWpOrder,
      durationMin: 90,
      foodSpots: [],
      photoPoints: [],
      lat: defaultCoords.lat,
      lng: defaultCoords.lng
    }

    const updatedWaypoints = [...trip.waypoints, newWaypoint]
    setTrip({ ...trip, waypoints: updatedWaypoints })
    setActiveWaypointId(newWpId)
    setSearchVal('')
    setSuggestions([])

    let lat = defaultCoords.lat
    let lng = defaultCoords.lng
    try {
      const searchQuery = cityContext ? `${newWaypoint.placeName}, ${cityContext}` : newWaypoint.placeName
      const coords = await geocodePlace(searchQuery)
      if (coords && !isNaN(coords.lat) && !isNaN(coords.lng)) {
        lat = coords.lat
        lng = coords.lng
      }
    } catch (err) {
      console.error('Geocoding failed for manual waypoint:', err)
    }

    const finalizedWaypoints = updatedWaypoints.map(wp => 
      wp.id === newWpId ? { ...wp, lat, lng } : wp
    )
    setTrip({ ...trip, waypoints: finalizedWaypoints })

    try {
      const localTripsStr = localStorage.getItem('local_trips') || '[]'
      const localTrips: TripDetail[] = JSON.parse(localTripsStr)
      const idx = localTrips.findIndex((t) => t.id === id)
      if (idx !== -1) {
        localTrips[idx].waypoints = finalizedWaypoints
        localStorage.setItem('local_trips', JSON.stringify(localTrips))
      }
    } catch (err) {
      console.error('Error saving manual waypoint to localStorage:', err)
    }

    try {
      const { doc, getDoc, setDoc } = await import('firebase/firestore')
      
      const tripRef = doc(db, 'trips', id)
      const tripSnap = await getDoc(tripRef)
      
      if (!tripSnap.exists()) {
        // Self-healing: Sync the whole trip and its waypoints if missing from Firestore
        await setDoc(tripRef, {
          userId: trip.userId,
          userName: trip.userName,
          title: trip.title,
          isPublic: trip.isPublic,
          sourceText: trip.sourceText,
          createdAt: trip.createdAt,
          isMock: trip.isMock || null,
          geminiError: trip.geminiError || null
        })
        
        for (const wp of finalizedWaypoints) {
          const wpRef = doc(db, 'trips', id, 'waypoints', wp.id)
          await setDoc(wpRef, wp)
        }
      } else {
        const wpRef = doc(db, 'trips', id, 'waypoints', newWpId)
        await setDoc(wpRef, {
          id: newWpId,
          placeName: newWaypoint.placeName,
          order: newWaypoint.order,
          durationMin: newWaypoint.durationMin,
          foodSpots: newWaypoint.foodSpots,
          photoPoints: newWaypoint.photoPoints,
          lat,
          lng
        })
      }
    } catch (err) {
      console.warn('Firestore sync failed for manual waypoint:', err)
    }
  }

  const handleOptimizeRoute = async () => {
    if (!trip || trip.waypoints.length <= 2) return

    // Nearest-neighbor Travelling Salesperson Problem (TSP) solver
    const waypointsCopy = [...trip.waypoints]
    const optimized: Waypoint[] = [waypointsCopy.shift()!]

    while (waypointsCopy.length > 0) {
      const last = optimized[optimized.length - 1]
      let nearestIdx = 0
      let minDistance = Infinity

      for (let i = 0; i < waypointsCopy.length; i++) {
        const current = waypointsCopy[i]
        // Euclidean distance metric
        const dist = Math.pow(current.lat - last.lat, 2) + Math.pow(current.lng - last.lng, 2)
        if (dist < minDistance) {
          minDistance = dist
          nearestIdx = i
        }
      }

      optimized.push(waypointsCopy.splice(nearestIdx, 1)[0])
    }

    const reorderedWaypoints = optimized.map((wp, idx) => ({
      ...wp,
      order: idx + 1
    }))

    const updatedTrip = {
      ...trip,
      waypoints: reorderedWaypoints
    }

    setTrip(updatedTrip)
    setActiveWaypointId(reorderedWaypoints[0].id)

    // Save to localStorage
    try {
      const localTripsStr = localStorage.getItem('local_trips') || '[]'
      const localTrips: TripDetail[] = JSON.parse(localTripsStr)
      const idx = localTrips.findIndex((t) => t.id === id)
      if (idx !== -1) {
        localTrips[idx].waypoints = reorderedWaypoints
        localStorage.setItem('local_trips', JSON.stringify(localTrips))
      }
    } catch (err) {
      console.error('Error saving optimized route to localStorage:', err)
    }

    // Save to Firestore
    try {
      const { doc, getDoc, setDoc, writeBatch } = await import('firebase/firestore')
      
      const tripRef = doc(db, 'trips', id)
      const tripSnap = await getDoc(tripRef)

      if (!tripSnap.exists()) {
        await setDoc(tripRef, {
          userId: trip.userId,
          userName: trip.userName,
          title: trip.title,
          isPublic: trip.isPublic,
          sourceText: trip.sourceText,
          createdAt: trip.createdAt,
          isMock: trip.isMock || null,
          geminiError: trip.geminiError || null
        })
        for (const wp of reorderedWaypoints) {
          const wpRef = doc(db, 'trips', id, 'waypoints', wp.id)
          await setDoc(wpRef, wp)
        }
      } else {
        const batch = writeBatch(db)
        reorderedWaypoints.forEach((wp) => {
          const wpRef = doc(db, 'trips', id, 'waypoints', wp.id)
          batch.update(wpRef, { order: wp.order })
        })
        await batch.commit()
      }
    } catch (err) {
      console.warn('Firestore sync failed for route optimization:', err)
    }
  }

  useEffect(() => {
    async function loadTripDetail() {
      setLoading(true)


      let fetchedTrip: TripDetail | null = null

      // 2. Check in localStorage
      try {
        const localTripsStr = localStorage.getItem('local_trips') || '[]'
        const localTrips: TripDetail[] = JSON.parse(localTripsStr)
        const match = localTrips.find((t) => t.id === id)
        if (match) {
          fetchedTrip = {
            id: match.id,
            userId: match.userId,
            userName: match.userName,
            title: match.title,
            isPublic: match.isPublic,
            sourceText: match.sourceText,
            createdAt: match.createdAt,
            isMock: match.isMock,
            geminiError: match.geminiError,
            waypoints: match.waypoints || []
          }
        }
      } catch (err) {
        console.error('Error reading localStorage for trip details:', err)
      }

      // 3. Check in Firestore (if local lookup not found or empty)
      if (!fetchedTrip) {
        try {
          const tripDocRef = doc(db, 'trips', id)
          const tripSnap = await getDoc(tripDocRef)
          
          if (tripSnap.exists()) {
            const tripData = tripSnap.data() as Trip
            const wpSnap = await getDocs(
              query(collection(db, 'trips', id, 'waypoints'), orderBy('order', 'asc'))
            )
            const waypoints: Waypoint[] = []
            wpSnap.forEach((docSnap) => {
              waypoints.push(docSnap.data() as Waypoint)
            })

            fetchedTrip = {
              ...tripData,
              id: tripSnap.id,
              waypoints
            }
          }
        } catch (err) {
          console.warn('⚠️ Firestore fetch failed for trip details:', err)
        }
      }

      // 4. Resolve Waypoint Coordinates if they are missing
      if (fetchedTrip && fetchedTrip.waypoints.length > 0) {
        let coordsChanged = false

        let cityContext = ''
        const titleLower = fetchedTrip.title.toLowerCase()
        if (titleLower.includes('jaipur') || titleLower.includes('rajasthan')) cityContext = 'Jaipur'
        else if (titleLower.includes('goa')) cityContext = 'Goa'
        else if (titleLower.includes('kerala') || titleLower.includes('alleppey') || titleLower.includes('munnar')) cityContext = 'Kerala'
        else if (titleLower.includes('ooty')) cityContext = 'Ooty'
        else if (titleLower.includes('kodaikanal')) cityContext = 'Kodaikanal'
        else if (titleLower.includes('delhi')) cityContext = 'Delhi'
        else if (titleLower.includes('agra')) cityContext = 'Agra'

        const CITY_CENTERS: { [key: string]: { lat: number; lng: number } } = {
          'Jaipur': { lat: 26.9124, lng: 75.7873 },
          'Goa': { lat: 15.2993, lng: 74.1240 },
          'Kerala': { lat: 9.9312, lng: 76.2673 },
          'Ooty': { lat: 11.4102, lng: 76.6950 },
          'Kodaikanal': { lat: 10.2381, lng: 77.4892 },
          'Delhi': { lat: 28.6139, lng: 77.2090 },
          'Agra': { lat: 27.1767, lng: 78.0081 }
        }

        const geocodedWaypoints = await Promise.all(
          fetchedTrip.waypoints.map(async (wp) => {
            const latVal = Number(wp.lat)
            const lngVal = Number(wp.lng)

            // Re-resolve if coordinates are missing, default center of India, or far from actual city center (self-healing)
            const isDefaultCenter = Math.abs(latVal - 20.5937) < 0.001 && Math.abs(lngVal - 78.9629) < 0.001

            let isFar = false
            if (cityContext && CITY_CENTERS[cityContext]) {
              const center = CITY_CENTERS[cityContext]
              isFar = (Math.pow(latVal - center.lat, 2) + Math.pow(lngVal - center.lng, 2) > 1.5) // ~120km
            }

            if (isNaN(latVal) || latVal === 0 || isNaN(lngVal) || lngVal === 0 || isDefaultCenter || isFar) {
              const coords = await resolveCoordinates(wp.placeName, cityContext)
              coordsChanged = true
              return {
                ...wp,
                lat: coords.lat,
                lng: coords.lng
              }
            }
            return wp
          })
        )
        fetchedTrip.waypoints = geocodedWaypoints
        setTrip(fetchedTrip)
        setActiveWaypointId(fetchedTrip.waypoints[0].id)

        // Persist geocoded coordinates back to the source for faster subsequent loads
        if (coordsChanged) {
          // A. Save back to localStorage
          try {
            const localTripsStr = localStorage.getItem('local_trips') || '[]'
            const localTrips: TripDetail[] = JSON.parse(localTripsStr)
            const idx = localTrips.findIndex((t) => t.id === id)
            if (idx !== -1) {
              localTrips[idx].waypoints = geocodedWaypoints
              localStorage.setItem('local_trips', JSON.stringify(localTrips))
            }
          } catch (err) {
            console.error('Error writing back coordinates to localStorage:', err)
          }

          // B. Save back to Firestore (non-blocking)
          try {
            const batchPromises = geocodedWaypoints.map(async (wp) => {
              if (wp.lat && wp.lng) {
                const wpRef = doc(db, 'trips', id, 'waypoints', wp.id)
                // Using merge option
                const { setDoc } = await import('firebase/firestore')
                await setDoc(wpRef, { lat: wp.lat, lng: wp.lng }, { merge: true })
              }
            })
            await Promise.all(batchPromises)
          } catch {
            // Ignore (DB might be uninitialized)
          }
        }
      } else if (fetchedTrip) {
        setTrip(fetchedTrip)
      }

      setLoading(false)
    }

    loadTripDetail()
  }, [id])

  const handleShare = () => {
    if (typeof window === 'undefined') return
    const url = window.location.href
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <ProtectedRoute>
      <div className="w-full min-h-screen bg-slate-50 dark:bg-slate-950 pb-20 flex flex-col overflow-hidden relative">
        {/* Sticky Header */}
        <header className="sticky top-0 z-40 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
          <Link href="/my-trips" className="h-8 w-8 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-655 dark:text-slate-200 flex items-center justify-center hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="text-center flex-1 mx-4 min-w-0">
            <h1 className="text-xs font-extrabold tracking-widest text-slate-400 dark:text-slate-500 uppercase">Trip Itinerary</h1>
            <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate mt-0.5">{loading ? 'Loading...' : trip?.title}</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={handleShare}
              className="h-8 w-8 rounded-xl bg-slate-100 dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 flex items-center justify-center hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors relative"
            >
              <Share2 className="h-4 w-4" />
              {copied && (
                <span className="absolute -bottom-8 right-0 bg-slate-900 text-white text-[8px] font-bold px-2 py-1 rounded shadow-md whitespace-nowrap animate-fade-in z-50">
                  URL Copied!
                </span>
              )}
            </button>
            <button
              onClick={() => setShowDeleteModal(true)}
              className="h-8 w-8 rounded-xl bg-slate-100 dark:bg-slate-800 text-rose-600 dark:text-rose-400 flex items-center justify-center hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </header>

        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6">
            <div className="h-8 w-8 rounded-full border-2 border-indigo-600/20 border-t-indigo-600 animate-spin" />
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-550 uppercase tracking-widest mt-3">Loading details & map...</p>
          </div>
        ) : !trip ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
            <div className="h-16 w-16 rounded-full bg-rose-50 dark:bg-rose-950/20 text-rose-505 flex items-center justify-center mb-4">
              <Compass className="h-8 w-8 text-rose-500" />
            </div>
            <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">Trip not found</h3>
            <p className="text-xs text-slate-450 mt-1 max-w-[220px]">This trip may have been removed or is unavailable.</p>
            <Link href="/my-trips" className="mt-5">
              <button className="bg-indigo-600 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white font-semibold text-xs px-5 py-2.5 rounded-xl">
                Back to Trips
              </button>
            </Link>
          </div>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden w-full relative">
            
            {/* Top 45% Map Split-Pane Container */}
            <div className="w-full h-[38vh] min-h-[260px] border-b border-slate-100 dark:border-slate-800 shrink-0 z-10 relative">
              <ItineraryMap 
                waypoints={trip.waypoints} 
                activeWaypointId={activeWaypointId} 
                travelMode={travelMode}
                onRouteInfoUpdate={setRouteInfo}
                startTrip={startTrip}
              />
            </div>

            {/* Bottom 55% Scrollable Timeline Cards */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 pb-20 bg-slate-50 dark:bg-slate-950">
              
              {/* Gemini API Error Debug Banner */}
              {trip.isMock && (
                <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/35 p-3.5 rounded-2xl flex flex-col gap-1 text-[10px] text-amber-800 dark:text-amber-400 font-semibold leading-normal animate-fade-in shadow-[0_2px_8px_rgba(0,0,0,0.01)] shrink-0">
                  <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-[11px] text-amber-700 dark:text-amber-300">
                    <Sparkles className="h-4 w-4 shrink-0 text-amber-500 fill-amber-500/10" />
                    Offline Mock Mode Active
                  </div>
                  <p className="mt-0.5">
                    This trip was generated using high-fidelity offline presets because the live Gemini API request returned an error.
                  </p>
                  {trip.geminiError && (
                    <div className="bg-white/40 dark:bg-black/35 p-2.5 rounded-lg border border-amber-200/50 dark:border-amber-900/10 font-mono mt-1 text-[9px] break-all leading-normal text-amber-900 dark:text-amber-250 select-text">
                      <span className="font-extrabold uppercase block mb-0.5 text-[8px] text-amber-850 dark:text-amber-400">Gemini Error Trace:</span>
                      {trip.geminiError}
                    </div>
                  )}
                </div>
              )}

              {/* Trip General Info Card */}
              <div className="bg-gradient-to-br from-indigo-900 to-slate-900 text-white p-4 rounded-[20px] shadow-sm flex flex-col border border-white/5 relative overflow-hidden shrink-0">
                <div className="absolute right-0 bottom-0 translate-y-6 translate-x-6 opacity-5 pointer-events-none">
                  <Compass className="h-32 w-32 rotate-12" />
                </div>
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/10 w-fit text-[8px] font-semibold text-indigo-200 uppercase tracking-wider">
                  <Sparkles className="h-2.5 w-2.5" />
                  Indian Tourism Optimized
                </div>
                <h2 className="text-sm font-extrabold mt-2 leading-tight">{trip.title}</h2>
                <div className="flex items-center gap-4 text-[9px] text-indigo-200 mt-3 pt-2 border-t border-white/10">
                  <div className="flex items-center gap-1">
                    <MapPin className="h-3 w-3 text-indigo-305" />
                    <span>India Route</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3 text-indigo-305" />
                    <span>{trip.waypoints.length} Stops Planned</span>
                  </div>
                </div>
              </div>

              {/* Travel Mode Selector Card */}
              <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 rounded-[20px] p-3.5 shadow-[0_2px_8px_rgba(0,0,0,0.01)] shrink-0 flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest pl-0.5">Travel Mode</span>
                  {routeInfo && (
                    <div className="flex items-center gap-2 text-[10px] font-extrabold text-indigo-600 dark:text-indigo-400">
                      <span>{routeInfo.distanceKm.toFixed(1)} km</span>
                      <span className="h-1.5 w-1.5 rounded-full bg-slate-300 dark:bg-slate-700" />
                      <span>{formatDuration(routeInfo.durationMin, travelMode)}</span>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-1 bg-slate-50 dark:bg-slate-950 p-1 rounded-xl border border-slate-100/50 dark:border-slate-800/40">
                  {([
                    { id: 'driving', label: 'Passenger', icon: '🚗' },
                    { id: 'two-wheeler', label: 'Two Wheeler', icon: '🏍️' },
                    { id: 'walking', label: 'Walking', icon: '🚶' }
                  ] as const).map((mode) => {
                    const isActive = travelMode === mode.id
                    return (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => {
                          setTravelMode(mode.id)
                        }}
                        className={`py-2 rounded-lg text-[10px] xs:text-xs font-bold transition-all duration-200 flex items-center justify-center gap-1 cursor-pointer ${
                          isActive
                            ? 'bg-indigo-600 text-white shadow-md scale-[1.01]'
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-350 hover:bg-slate-100/50 dark:hover:bg-slate-900/45'
                        }`}
                      >
                        <span className="text-sm">{mode.icon}</span>
                        <span className="inline">{mode.label}</span>
                      </button>
                    )
                  })}
                </div>
                <button
                  type="button"
                  onClick={() => setStartTrip(!startTrip)}
                  className={`w-full py-2.5 rounded-xl text-xs font-bold transition-all duration-200 flex items-center justify-center gap-1.5 cursor-pointer border ${
                    startTrip
                      ? 'bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-900/50 hover:bg-rose-100 dark:hover:bg-rose-900/30'
                      : 'bg-indigo-600 hover:bg-indigo-700 text-white border-transparent shadow-sm shadow-indigo-600/10 active:scale-[0.98]'
                  }`}
                >
                  {startTrip ? (
                    <>
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                      </span>
                      Stop Navigation
                    </>
                  ) : (
                    <>
                      <span className="text-sm">▶</span>
                      Start Navigation
                    </>
                  )}
                </button>
              </div>

              {/* Waypoint Timeline List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest pl-1">Waypoint Timeline</h3>
                  {trip.waypoints.length > 2 && (
                    <button
                      type="button"
                      onClick={handleOptimizeRoute}
                      className="text-[9px] font-extrabold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 flex items-center gap-1 bg-indigo-50 dark:bg-indigo-950/30 px-2.5 py-1 rounded-xl border border-indigo-100/40 dark:border-indigo-900/30 transition-colors shadow-[0_1px_3px_rgba(0,0,0,0.02)] cursor-pointer"
                    >
                      <Sparkles className="h-2.5 w-2.5 animate-pulse text-indigo-500" />
                      Optimize Route
                    </button>
                  )}
                </div>
                
                {trip.waypoints.length === 0 ? (
                  <div className="text-center p-6 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl">
                    <p className="text-xs text-slate-400">No waypoints configured for this route.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {trip.waypoints.map((wp) => {
                      const isActive = activeWaypointId === wp.id
                      return (
                        <div
                          key={wp.id}
                          onClick={() => setActiveWaypointId(wp.id)}
                          className={`bg-white dark:bg-slate-900 rounded-2xl border transition-all duration-300 p-4 shadow-[0_2px_8px_rgba(0,0,0,0.01)] cursor-pointer flex flex-col ${
                            isActive
                              ? 'border-indigo-500 dark:border-indigo-400 ring-2 ring-indigo-500/10 dark:ring-indigo-400/5'
                              : 'border-slate-100 dark:border-slate-800/85 hover:border-slate-200 dark:hover:border-slate-700'
                          }`}
                        >
                          {/* Card Header */}
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-2.5">
                              {/* Order Number Badge */}
                              <div className={`h-6 w-6 rounded-full shrink-0 flex items-center justify-center text-xs font-black transition-colors ${
                                isActive 
                                  ? 'bg-indigo-600 text-white' 
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                              }`}>
                                {wp.order}
                              </div>
                              <div>
                                 <h4 className="font-extrabold text-xs text-slate-800 dark:text-slate-100 leading-tight">{wp.placeName}</h4>
                                 <div className="flex items-center gap-1.5 mt-0.5">
                                   <p className="text-[9px] text-slate-400 dark:text-slate-500 font-semibold uppercase">Stop Details</p>
                                   <span className="text-[9px] text-slate-350 dark:text-slate-700 font-light">|</span>
                                   <p className="text-[9px] font-mono text-slate-450 dark:text-slate-500">
                                     {wp.lat !== undefined && wp.lng !== undefined && wp.lat !== null && wp.lng !== null ? `${wp.lat.toFixed(4)}°, ${wp.lng.toFixed(4)}°` : '0.0000°, 0.0000°'}
                                   </p>
                                 </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-800/60 px-2 py-0.5 rounded-lg border border-slate-100 dark:border-slate-750 text-slate-500 dark:text-slate-400 text-[9px] font-bold">
                                <Clock className="h-3 w-3" />
                                <span>{wp.durationMin} mins</span>
                              </div>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleDeleteWaypoint(wp.id)
                                }}
                                className="p-1 rounded-lg bg-rose-50 dark:bg-rose-950/25 text-rose-600 hover:bg-rose-100 dark:hover:bg-rose-900/35 transition-colors"
                                title="Delete Spot"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Collapsible Accordion content (only shows for the active stop) */}
                          <div className={`grid transition-all duration-300 ${
                            isActive ? 'grid-rows-[1fr] opacity-100 mt-4 pt-3 border-t border-slate-50 dark:border-slate-800/40' : 'grid-rows-[0fr] opacity-0 overflow-hidden'
                          }`}>
                            <div className="overflow-hidden space-y-3.5">
                              {/* Food Spots */}
                              {wp.foodSpots && wp.foodSpots.length > 0 && (
                                <div>
                                  <div className="flex items-center gap-1 text-[9px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">
                                    <Utensils className="h-3.5 w-3.5 text-emerald-500" />
                                    AI Food Recommendations
                                  </div>
                                  <div className="flex flex-wrap gap-1.5">
                                    {wp.foodSpots.map((food, fIdx) => (
                                      <span
                                        key={fIdx}
                                        className="px-2.5 py-1 bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-450 text-[10px] font-bold rounded-lg border border-emerald-100/40 dark:border-emerald-900/20 whitespace-nowrap"
                                      >
                                        {food}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Photo Points */}
                              {wp.photoPoints && wp.photoPoints.length > 0 && (
                                <div>
                                  <div className="flex items-center gap-1 text-[9px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">
                                    <Camera className="h-3.5 w-3.5 text-indigo-500" />
                                    Scenic Photo Highlights
                                  </div>
                                  <ul className="space-y-1.5 pl-1">
                                    {wp.photoPoints.map((photo, pIdx) => (
                                      <li key={pIdx} className="flex items-start gap-2 text-[10px] text-slate-600 dark:text-slate-350 leading-relaxed font-medium">
                                        <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 shrink-0 mt-1.5" />
                                        <span>{photo}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          </div>

                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Add Spot Input Section */}
                <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 rounded-2xl p-4 shadow-[0_2px_8px_rgba(0,0,0,0.01)] relative mt-4">
                  <div className="text-[10px] font-bold text-slate-450 dark:text-slate-500 uppercase tracking-wider mb-2.5 flex items-center gap-1.5 pl-0.5">
                    <Plus className="h-3.5 w-3.5 text-indigo-500" />
                    Add a New Spot to Itinerary
                  </div>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <input
                        type="text"
                        value={searchVal}
                        onChange={(e) => handleSearchChange(e.target.value)}
                        placeholder="Search and add a place..."
                        className="w-full h-10 pl-9 pr-4 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-100/60 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/35 transition-all text-slate-800 dark:text-slate-100 font-semibold"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleAddCurrentLocation}
                      disabled={locatingCurrent}
                      className="h-10 w-10 shrink-0 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-indigo-600 dark:text-indigo-400 rounded-xl flex items-center justify-center shadow-sm active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                      title="Use current location"
                    >
                      {locatingCurrent ? (
                        <Loader2 className="h-4 w-4 animate-spin text-indigo-600 dark:text-indigo-400" />
                      ) : (
                        <Navigation className="h-4 w-4 fill-indigo-600/10" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={handleAddStopManually}
                      className="h-10 px-4 bg-indigo-600 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1 shadow-sm active:scale-95 transition-all cursor-pointer"
                    >
                      <Plus className="h-4 w-4" />
                      Add
                    </button>
                  </div>

                  {/* Autocomplete suggestions dropdown */}
                  {searchingSuggestions && (
                    <div className="absolute left-4 right-4 top-[74px] z-50 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-3 rounded-xl flex items-center justify-center gap-2 shadow-lg">
                      <Loader2 className="h-4 w-4 text-indigo-500 animate-spin" />
                      <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Searching...</span>
                    </div>
                  )}
                  {!searchingSuggestions && suggestions.length > 0 && (
                    <div className="absolute left-4 right-4 top-[74px] z-50 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-xl rounded-xl overflow-hidden divide-y divide-slate-50 dark:divide-slate-800/40 max-h-56 overflow-y-auto">
                      {suggestions.map((place, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleAddWaypoint(place)}
                          className="w-full text-left px-3.5 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 flex items-start gap-2.5 transition-colors cursor-pointer"
                        >
                          <MapPin className="h-4 w-4 text-indigo-500 shrink-0 mt-0.5" />
                          <div className="min-w-0">
                            <span className="block text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                              {place.display_name.split(',')[0]}
                            </span>
                            <span className="block text-[9px] text-slate-400 font-semibold truncate mt-0.5">
                              {place.display_name}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>
        )}

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
                  onClick={() => setShowDeleteModal(false)}
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
