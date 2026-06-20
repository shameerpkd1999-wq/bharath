'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { 
  Sparkles, 
  MapPin, 
  Calendar, 
  CreditCard, 
  Users, 
  AlertCircle, 
  Compass, 
  Search, 
  Link as LinkIcon, 
  Trash2, 
  ArrowUp, 
  ArrowDown, 
  Plus, 
  ChevronDown, 
  ChevronUp, 
  Loader2 
} from 'lucide-react'
import ProtectedRoute from '@/components/ProtectedRoute'
import { useAuth } from '@/context/AuthContext'
import { parseItinerary } from '@/app/actions/parseItinerary'
import { geocodePlace, getPlaceSuggestions, PlaceSuggestion } from '@/app/actions/geocode'
import { db } from '@/lib/firebase'

interface ParsedPlace {
  placeName: string
  lat?: number
  lng?: number
}

interface CustomStopItem {
  id: string
  placeName: string
  lat: number
  lng: number
  durationMin: number
  foodSpots: string
  photoPoints: string
  editing: boolean
}

// Helper to parse single-place, search, query, and direction URLs from Google Maps & Mappls (MapmyIndia)
function parseMapLinkUrl(urlString: string): ParsedPlace[] {
  try {
    const url = new URL(urlString)
    const pathname = url.pathname
    
    // --- MAPPLS (MAPMYINDIA) LINK PARSING ---
    if (url.hostname.includes('mappls.com')) {
      // 1. Coordinate-based URL: /place/@lat,lng or /@lat,lng or similar
      const coordMatch = pathname.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
      if (coordMatch) {
        const lat = parseFloat(coordMatch[1])
        const lng = parseFloat(coordMatch[2])
        return [{ placeName: `Mappls Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`, lat, lng }]
      }
      
      // 2. Navigation URL: ?places=lat,lng,name or ?places=lat,lng
      const placesParam = url.searchParams.get('places')
      if (placesParam) {
        const parts = placesParam.split(',')
        if (parts.length >= 2) {
          const lat = parseFloat(parts[0])
          const lng = parseFloat(parts[1])
          const name = parts[2] ? decodeURIComponent(parts[2]).replace(/\+/g, ' ') : `Mappls Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`
          return [{ placeName: name, lat, lng }]
        }
      }
      
      // 3. Mappls Pin: /9ADJ1X
      const cleanPath = pathname.replace(/^\//, '').trim()
      if (cleanPath && cleanPath.length === 6 && !cleanPath.includes('/')) {
        return [{ placeName: `Mappls Pin: ${cleanPath}` }]
      }
    }
    
    // --- GOOGLE MAPS LINK PARSING ---
    // 1. Direction URLs: /maps/dir/Place1/Place2/...
    if (pathname.includes('/maps/dir/')) {
      const dirIndex = pathname.indexOf('/maps/dir/')
      const partsStr = pathname.substring(dirIndex + 10)
      const parts = partsStr.split('/').filter(p => p.trim() !== '' && !p.startsWith('@'))
      
      const results: ParsedPlace[] = []
      for (const part of parts) {
        const placeName = decodeURIComponent(part.replace(/\+/g, ' ')).trim()
        if (placeName) {
          results.push({ placeName })
        }
      }
      return results
    }
    
    // 2. Place URLs: /maps/place/PlaceName/@lat,lng,...
    if (pathname.includes('/maps/place/')) {
      const placeMatch = pathname.match(/\/maps\/place\/([^/]+)/)
      if (placeMatch) {
        const placeName = decodeURIComponent(placeMatch[1].replace(/\+/g, ' ')).trim()
        let lat: number | undefined
        let lng: number | undefined
        
        const coordMatch = pathname.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
        if (coordMatch) {
          lat = parseFloat(coordMatch[1])
          lng = parseFloat(coordMatch[2])
        }
        
        return [{ placeName, lat, lng }]
      }
    }
    
    // 3. Search URLs: /maps/search/PlaceName
    if (pathname.includes('/maps/search/')) {
      const searchMatch = pathname.match(/\/maps\/search\/([^/]+)/)
      if (searchMatch) {
        const placeName = decodeURIComponent(searchMatch[1].replace(/\+/g, ' ')).trim()
        return [{ placeName }]
      }
    }
    
    // 4. Query param Q: ?q=PlaceName
    const qParam = url.searchParams.get('q')
    if (qParam) {
      const placeName = decodeURIComponent(qParam.replace(/\+/g, ' ')).trim()
      let lat: number | undefined
      let lng: number | undefined
      
      const coordMatch = qParam.match(/^(-?\d+\.\d+),(-?\d+\.\d+)$/)
      if (coordMatch) {
        lat = parseFloat(coordMatch[1])
        lng = parseFloat(coordMatch[2])
        return [{ placeName: `Location (${lat}, ${lng})`, lat, lng }]
      }
      
      return [{ placeName }]
    }
  } catch {
    // Regex coordinates fallback
    const coordMatch = urlString.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
    if (coordMatch) {
      const lat = parseFloat(coordMatch[1])
      const lng = parseFloat(coordMatch[2])
      return [{ placeName: `Location (${lat}, ${lng})`, lat, lng }]
    }
  }
  return []
}

// Background geocoding helper using Nominatim (server-side via action to bypass CORS)
async function resolveCoordsForCustomStop(name: string): Promise<{ lat: number; lng: number }> {
  try {
    const coords = await geocodePlace(name)
    if (coords && !isNaN(coords.lat) && !isNaN(coords.lng)) {
      return coords
    }
  } catch (err) {
    console.error('Geocoder lookup failed for custom stop:', err)
  }
  return { lat: 20.5937, lng: 78.9629 } // general India fallback
}

const COVER_PRESETS = [
  { id: 'wanderlust', label: 'Wanderlust', url: 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?q=80&w=600&auto=format&fit=crop' },
  { id: 'tajmahal', label: 'Taj Mahal', url: 'https://images.unsplash.com/photo-1564507592333-c60657eea523?q=80&w=600&auto=format&fit=crop' },
  { id: 'jaipur', label: 'Jaipur', url: 'https://images.unsplash.com/photo-1477584308802-e9c378852d92?q=80&w=600&auto=format&fit=crop' },
  { id: 'kerala', label: 'Kerala', url: 'https://images.unsplash.com/photo-1593693397690-362cb9666fc2?q=80&w=600&auto=format&fit=crop' },
  { id: 'goa', label: 'Goa', url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=600&auto=format&fit=crop' },
  { id: 'mountains', label: 'Mountains', url: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?q=80&w=600&auto=format&fit=crop' },
]

// Helper functions defined outside the React component to satisfy React 19 compiler purity checks
const generateCustomWaypointId = (stopCount: number, offset: number = 0): string => `custom-wp-${Date.now()}-${stopCount + offset}`
const generateCustomTripId = (): string => 'custom-trip-' + Date.now()
const generateTimestamp = (): string => new Date().toISOString()

export default function CreateTripPage() {
  const { user } = useAuth()
  const router = useRouter()

  // Navigation Tab selection
  const [activeTab, setActiveTab] = useState<'ai' | 'custom'>('ai')

  // Common UI State
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [isPublicAi, setIsPublicAi] = useState(true)
  const [isPublicCustom, setIsPublicCustom] = useState(true)
  const [coverUrl, setCoverUrl] = useState('https://images.unsplash.com/photo-1488646953014-85cb44e25828?q=80&w=600&auto=format&fit=crop')

  // ==========================================
  // AI Generator Tab State & Handlers
  // ==========================================
  const [inputText, setInputText] = useState('')
  const [selectedDuration, setSelectedDuration] = useState(5)
  const [selectedBudget, setSelectedBudget] = useState('standard')
  const [selectedCompanions, setSelectedCompanions] = useState('solo')
  
  const budgetOptions = [
    { value: 'budget', label: 'Budget', desc: 'Backpacker style' },
    { value: 'standard', label: 'Standard', desc: 'Comfortable stay' },
    { value: 'luxury', label: 'Luxury', desc: 'Premium hotels' },
  ]

  const companionOptions = [
    { value: 'solo', label: 'Solo' },
    { value: 'couple', label: 'Couple' },
    { value: 'family', label: 'Family' },
    { value: 'friends', label: 'Friends' },
  ]

  const handleGenerate = async () => {
    if (!inputText || !inputText.trim()) {
      setError('Please tell us about your destination or copy/paste travel notes first.')
      return
    }
    if (!user) {
      setError('You must be logged in to create itineraries.')
      return
    }

    setError('')
    setGenerating(true)

    const compiledNotes = `
Destination details & ideas: ${inputText.trim()}
Trip duration: ${selectedDuration} days
Selected budget style: ${selectedBudget}
Traveling companions: ${selectedCompanions}
`

    try {
      const result = await parseItinerary(compiledNotes, user.uid, user.displayName || 'Traveler', isPublicAi, coverUrl)
      
      try {
        const storedTripsStr = localStorage.getItem('local_trips') || '[]'
        const storedTrips = JSON.parse(storedTripsStr)
        storedTrips.push({
          ...result.trip,
          waypoints: result.waypoints
        })
        localStorage.setItem('local_trips', JSON.stringify(storedTrips))
      } catch (storageErr) {
        console.error('Failed to save trip to localStorage:', storageErr)
      }

      router.push('/my-trips')
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      console.error(err)
      setError(errorMsg || 'Failed to generate itinerary. Please try again.')
    } finally {
      setGenerating(false)
    }
  }

  // ==========================================
  // Custom Route Builder Tab State & Handlers
  // ==========================================
  const [customTitle, setCustomTitle] = useState('')
  const [customStops, setCustomStops] = useState<CustomStopItem[]>([])
  const [searchVal, setSearchVal] = useState('')
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([])
  const [searchingSuggestions, setSearchingSuggestions] = useState(false)

  // Debounced real-time Nominatim suggestions for place search input
  useEffect(() => {
    if (searchVal.trim().length < 3 || searchVal.startsWith('http://') || searchVal.startsWith('https://')) {
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

  const handleSelectSuggestion = (place: PlaceSuggestion) => {
    const newStop: CustomStopItem = {
      id: generateCustomWaypointId(customStops.length),
      placeName: place.display_name,
      lat: parseFloat(String(place.lat)),
      lng: parseFloat(String(place.lon)),
      durationMin: 90,
      foodSpots: '',
      photoPoints: '',
      editing: false
    }

    setCustomStops(prev => [...prev, newStop])
    setSearchVal('')
    setSuggestions([])
  }

  const handleImportUrl = async (urlStr: string) => {
    setError('')
    
    if (urlStr.includes('maps.app.goo.gl')) {
      setError('Shortened Google Maps links cannot be direct-parsed due to security policies. Please search by place name, or paste a full web browser Google Maps link.')
      return
    }

    const parsed = parseMapLinkUrl(urlStr)
    if (parsed.length === 0) {
      setError('Could not extract location details from the pasted URL. Please verify it is a valid Google Maps or Mappls link.')
      return
    }

    setSearchVal('')
    setSuggestions([])

    // Resolve coordinates in background for parsed locations
    const newStops = await Promise.all(
      parsed.map(async (item, index) => {
        let lat = item.lat
        let lng = item.lng
        
        if (lat === undefined || lng === undefined) {
          const coords = await resolveCoordsForCustomStop(item.placeName)
          lat = coords.lat
          lng = coords.lng
        }
        
        return {
          id: generateCustomWaypointId(customStops.length, index),
          placeName: item.placeName,
          lat: lat,
          lng: lng,
          durationMin: 90,
          foodSpots: '',
          photoPoints: '',
          editing: false
        }
      })
    )

    setCustomStops(prev => [...prev, ...newStops])
  }

  const handleAddStopManually = async () => {
    if (!searchVal.trim()) return
    
    if (searchVal.startsWith('http://') || searchVal.startsWith('https://')) {
      await handleImportUrl(searchVal)
      return
    }

    const newStop: CustomStopItem = {
      id: generateCustomWaypointId(customStops.length),
      placeName: searchVal.trim(),
      lat: 20.5937,
      lng: 78.9629,
      durationMin: 90,
      foodSpots: '',
      photoPoints: '',
      editing: false
    }
    
    setCustomStops(prev => [...prev, newStop])
    setSearchVal('')
    setSuggestions([])

    // Refine coordinates in the background
    const coords = await resolveCoordsForCustomStop(newStop.placeName)
    setCustomStops(prev => prev.map(item => item.id === newStop.id ? { ...item, lat: coords.lat, lng: coords.lng } : item))
  }

  const moveStop = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return
    if (direction === 'down' && index === customStops.length - 1) return
    
    const newStops = [...customStops]
    const swapIndex = direction === 'up' ? index - 1 : index + 1
    const temp = newStops[index]
    newStops[index] = newStops[swapIndex]
    newStops[swapIndex] = temp
    
    setCustomStops(newStops)
  }

  const deleteStop = (index: number) => {
    setCustomStops(customStops.filter((_, idx) => idx !== index))
  }

  const updateStopField = (id: string, field: string, value: string | number | boolean) => {
    setCustomStops(prev => prev.map(wp => wp.id === id ? { ...wp, [field]: value } : wp))
  }

  const toggleEditStop = (id: string) => {
    setCustomStops(prev => prev.map(wp => wp.id === id ? { ...wp, editing: !wp.editing } : wp))
  }

  const handleCreateCustomTrip = async () => {
    if (!customTitle.trim()) {
      setError('Please enter a trip title.')
      return
    }
    if (customStops.length === 0) {
      setError('Please add at least one stop to your route.')
      return
    }
    if (!user) {
      setError('You must be logged in to create itineraries.')
      return
    }

    setError('')
    setGenerating(true)

    const clonedTripId = generateCustomTripId()
    const newTimestamp = generateTimestamp()

    const customTripData = {
      userId: user.uid,
      userName: user.displayName || 'Traveler',
      title: customTitle.trim(),
      isPublic: isPublicCustom,
      sourceText: 'Custom route builder',
      createdAt: newTimestamp,
      coverUrl: coverUrl || null
    }

    const customWaypoints = customStops.map((wp, index) => ({
      id: `wp-${clonedTripId}-${index}`,
      placeName: wp.placeName,
      order: index + 1,
      durationMin: parseInt(String(wp.durationMin)) || 90,
      foodSpots: typeof wp.foodSpots === 'string' 
        ? wp.foodSpots.split(',').map((s: string) => s.trim()).filter(Boolean)
        : wp.foodSpots || [],
      photoPoints: typeof wp.photoPoints === 'string'
        ? wp.photoPoints.split(',').map((s: string) => s.trim()).filter(Boolean)
        : wp.photoPoints || [],
      lat: wp.lat || 20.5937,
      lng: wp.lng || 78.9629
    }))

    // 1. Save to localStorage first (instant & reliable)
    try {
      const storedTripsStr = localStorage.getItem('local_trips') || '[]'
      const storedTrips = JSON.parse(storedTripsStr)
      storedTrips.push({
        id: clonedTripId,
        ...customTripData,
        waypoints: customWaypoints
      })
      localStorage.setItem('local_trips', JSON.stringify(storedTrips))
    } catch (storageErr) {
      console.error('Failed to save custom trip to localStorage:', storageErr)
    }

    // 2. Save to Firestore in background (non-blocking)
    import('firebase/firestore').then(async ({ doc, setDoc }) => {
      try {
        const tripRef = doc(db, 'trips', clonedTripId)
        await setDoc(tripRef, customTripData)
        for (const wp of customWaypoints) {
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
        console.warn('⚠️ Background Firestore sync for custom trip failed:', err)
      }
    }).catch(err => console.error('Failed to import firestore module:', err))

    setGenerating(false)
    router.push('/my-trips')
  }

  const isUrlPasted = searchVal.startsWith('http://') || searchVal.startsWith('https://')

  return (
    <ProtectedRoute>
      <div className="w-full min-h-screen bg-slate-50 dark:bg-slate-950 pb-20 flex flex-col relative">
        {/* Dynamic Loading Overlay */}
        {generating && (
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex flex-col items-center justify-center p-6 text-center animate-fade-in">
            <div className="relative h-20 w-20 flex items-center justify-center mb-6">
              <div className="absolute inset-0 rounded-full border-4 border-indigo-500/20 border-t-indigo-500 animate-spin" />
              <Compass className="h-9 w-9 text-indigo-400 animate-pulse" />
            </div>
            <h3 className="font-extrabold text-sm text-white tracking-wide uppercase">
              {activeTab === 'ai' ? 'AI Planner Active' : 'Building Route'}
            </h3>
            <p className="text-xs text-indigo-200 mt-2 max-w-[240px]">
              {activeTab === 'ai' 
                ? 'AI is planning your Indian adventure... looking up scenic landmarks and iconic local food spots.'
                : 'Saving your custom roadmap and placing marker points on the map...'}
            </p>
          </div>
        )}

        {/* Header */}
        <header className="sticky top-0 z-40 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md px-4 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <h1 className="text-base font-bold text-slate-800 dark:text-slate-100">Plan New Trip</h1>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">Create custom or AI itineraries</p>
        </header>

        {/* Tab Toggle Bar */}
        <div className="flex border-b border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900/40 backdrop-blur-sm sticky top-[68px] z-30 shrink-0">
          <button
            type="button"
            onClick={() => {
              setActiveTab('ai')
              setError('')
            }}
            className={`flex-1 py-3 text-xs font-bold transition-all flex items-center justify-center gap-1.5 border-b-2 ${
              activeTab === 'ai'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-400 dark:text-slate-500 hover:text-slate-600'
            }`}
          >
            <Sparkles className="h-4 w-4" />
            AI Assistant
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('custom')
              setError('')
            }}
            className={`flex-1 py-3 text-xs font-bold transition-all flex items-center justify-center gap-1.5 border-b-2 ${
              activeTab === 'custom'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-400 dark:text-slate-500 hover:text-slate-600'
            }`}
          >
            <Compass className="h-4 w-4" />
            Custom Builder
          </button>
        </div>

        {/* Form Content */}
        <div className="p-4 space-y-5 flex-1 flex flex-col overflow-y-auto">
          {/* Error alert box */}
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 text-rose-600 dark:text-rose-450 text-[10px] font-bold leading-normal animate-fade-in">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-500" />
              <span>{error}</span>
            </div>
          )}

          {/* ========================================================== */}
          {/* TAB 1: AI ASSISTANT VIEW */}
          {/* ========================================================== */}
          {activeTab === 'ai' && (
            <div className="space-y-5 flex-1 flex flex-col">
              {/* Destination Choice */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-450 dark:text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-indigo-500" />
                  Your Destination Notes
                </label>
                <textarea
                  rows={4}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="e.g. Paste a list of monuments you want to see, or type 'A 4-day trip to Jaipur showing forts, heritage markets, and local food spots'..."
                  className="w-full p-3 text-xs bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/35 transition-all text-slate-800 dark:text-slate-100 font-medium resize-none shadow-sm dark:shadow-none"
                />
              </div>

              {/* Duration Slider/Controls */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-450 dark:text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-indigo-500" />
                  How many days?
                </label>
                <div className="flex gap-2 overflow-x-auto scrollbar-none">
                  {[3, 5, 7, 10, 14].map((days) => (
                    <button
                      key={days}
                      type="button"
                      onClick={() => setSelectedDuration(days)}
                      className={`flex-1 min-w-[60px] py-2.5 rounded-xl text-xs font-bold transition-all border ${
                        selectedDuration === days
                          ? 'bg-indigo-50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-900/50 text-indigo-600 dark:text-indigo-400 shadow-sm'
                          : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-100 dark:border-slate-800'
                      }`}
                    >
                      {days} Days
                    </button>
                  ))}
                </div>
              </div>

              {/* Budget tier */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-450 dark:text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <CreditCard className="h-3.5 w-3.5 text-indigo-500" />
                  Choose your budget
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {budgetOptions.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setSelectedBudget(opt.value)}
                      className={`p-2.5 rounded-xl text-center transition-all border flex flex-col items-center justify-center ${
                        selectedBudget === opt.value
                          ? 'bg-indigo-50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-900/50 text-indigo-600 dark:text-indigo-400 shadow-sm'
                          : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-100 dark:border-slate-800'
                      }`}
                    >
                      <span className="text-xs font-bold">{opt.label}</span>
                      <span className="text-[8px] text-slate-400 mt-0.5">{opt.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Companion setup */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-450 dark:text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 text-indigo-500" />
                  Who is travelling?
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {companionOptions.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setSelectedCompanions(opt.value)}
                      className={`py-2 rounded-xl text-center text-xs font-bold transition-all border ${
                        selectedCompanions === opt.value
                          ? 'bg-indigo-50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-900/50 text-indigo-600 dark:text-indigo-400 shadow-sm'
                          : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-100 dark:border-slate-800'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Cover Photo Selector */}
              <div className="space-y-2.5 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 rounded-[20px] p-4 shadow-[0_2px_8px_rgba(0,0,0,0.01)] shrink-0 animate-fade-in">
                <span className="text-[10px] font-bold text-slate-450 dark:text-slate-500 uppercase tracking-wider block">
                  Select Trip Cover Photo
                </span>
                <div className="grid grid-cols-3 gap-2 mt-1">
                  {COVER_PRESETS.map((preset) => {
                    const isSelected = coverUrl === preset.url
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => setCoverUrl(preset.url)}
                        className={`relative h-14 rounded-xl overflow-hidden border-2 transition-all cursor-pointer ${
                          isSelected
                            ? 'border-indigo-600 scale-[1.02] shadow-sm'
                            : 'border-transparent hover:border-slate-200 dark:hover:border-slate-700'
                        }`}
                      >
                        <img
                          src={preset.url}
                          alt={preset.label}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-black/35 flex items-center justify-center">
                          <span className="text-[8px] font-extrabold text-white leading-none px-1 py-0.5 rounded bg-black/40">
                            {preset.label}
                          </span>
                        </div>
                        {isSelected && (
                          <div className="absolute top-1 right-1 h-3.5 w-3.5 rounded-full bg-indigo-600 flex items-center justify-center border border-white">
                            <span className="text-[7px] text-white font-bold">✓</span>
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
                {/* Custom URL input */}
                <div className="mt-2 pt-2 border-t border-slate-50 dark:border-slate-800/30">
                  <span className="text-[8px] font-bold text-slate-450 dark:text-slate-500 uppercase tracking-wider block mb-1">
                    Or Enter Custom Image URL
                  </span>
                  <input
                    type="text"
                    value={coverUrl}
                    onChange={(e) => setCoverUrl(e.target.value)}
                    placeholder="https://example.com/photo.jpg"
                    className="w-full h-8 px-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Share Toggle */}
              <div className="flex items-center gap-2 py-1 select-none animate-fade-in">
                <input
                  type="checkbox"
                  id="isPublicAi"
                  checked={isPublicAi}
                  onChange={(e) => setIsPublicAi(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 text-indigo-650 dark:text-indigo-500 focus:ring-indigo-500 cursor-pointer"
                />
                <label
                  htmlFor="isPublicAi"
                  className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer"
                >
                  Share this itinerary with the community (Explore Feed)
                </label>
              </div>

              {/* Generate CTA Button */}
              <div className="pt-4 mt-auto">
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={generating}
                  className="w-full h-12 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white font-bold text-xs rounded-xl shadow-lg shadow-indigo-200 dark:shadow-none flex items-center justify-center gap-2 group transition-all duration-200 disabled:opacity-50 active:scale-[0.98]"
                >
                  <Sparkles className="h-4 w-4 fill-white/10 group-hover:scale-110 transition-transform" />
                  Generate AI Itinerary
                </button>
              </div>
            </div>
          )}

          {/* ========================================================== */}
          {/* TAB 2: CUSTOM BUILDER VIEW */}
          {/* ========================================================== */}
          {activeTab === 'custom' && (
            <div className="space-y-5 flex-1 flex flex-col">
              {/* Trip Title */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-450 dark:text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Compass className="h-3.5 w-3.5 text-indigo-500" />
                  Trip Title
                </label>
                <input
                  type="text"
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  placeholder="e.g. Scenic Tour of Kerala or Weekend Agra Walk"
                  className="w-full h-11 px-3 text-xs bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/35 transition-all text-slate-800 dark:text-slate-100 font-semibold shadow-sm dark:shadow-none"
                />
              </div>

              {/* Waypoint Search / Google Maps URL input */}
              <div className="space-y-1.5 relative">
                <label className="text-[11px] font-bold text-slate-450 dark:text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-indigo-500" />
                  Add Stops (Search place or paste Maps Link)
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    {isUrlPasted ? (
                      <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-indigo-500" />
                    ) : (
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    )}
                    <input
                      type="text"
                      value={searchVal}
                      onChange={(e) => {
                        const val = e.target.value
                        setSearchVal(val)
                        if (val.trim().length < 3 || val.startsWith('http://') || val.startsWith('https://')) {
                          setSuggestions([])
                        }
                      }}
                      placeholder="Type a location or paste a Google Maps Link..."
                      className="w-full h-11 pl-9 pr-4 text-xs bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/35 transition-all text-slate-800 dark:text-slate-100 font-semibold shadow-sm dark:shadow-none"
                    />
                  </div>
                  {isUrlPasted ? (
                    <button
                      type="button"
                      onClick={() => handleImportUrl(searchVal)}
                      className="h-11 px-4 bg-indigo-600 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1 shadow-sm active:scale-95 transition-all"
                    >
                      <Plus className="h-4 w-4" />
                      Import
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleAddStopManually}
                      className="h-11 px-4 bg-indigo-600 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1 shadow-sm active:scale-95 transition-all"
                    >
                      <Plus className="h-4 w-4" />
                      Add
                    </button>
                  )}
                </div>

                {/* Search Suggestion Dropdown overlay */}
                {searchingSuggestions && (
                  <div className="absolute top-[68px] left-0 right-0 z-50 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-3 flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 text-indigo-500 animate-spin" />
                    <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Searching suggestions...</span>
                  </div>
                )}
                {!searchingSuggestions && suggestions.length > 0 && (
                  <div className="absolute top-[68px] left-0 right-0 z-50 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-xl overflow-hidden divide-y divide-slate-50 dark:divide-slate-800/40 max-h-56 overflow-y-auto">
                    {suggestions.map((place, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleSelectSuggestion(place)}
                        className="w-full text-left px-3.5 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 flex items-start gap-2.5 transition-colors"
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

              {/* Waypoints timeline list */}
              <div className="flex-1 flex flex-col">
                <div className="text-[11px] font-bold text-slate-450 dark:text-slate-500 uppercase tracking-wider flex items-center gap-1.5 mb-2.5">
                  <Compass className="h-3.5 w-3.5 text-indigo-500" />
                  Route Stops ({customStops.length})
                </div>

                {customStops.length > 0 ? (
                  <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
                    {customStops.map((wp, index) => (
                      <div 
                        key={wp.id} 
                        className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-3 flex flex-col gap-2.5 transition-all shadow-[0_2px_8px_rgba(0,0,0,0.01)]"
                      >
                        {/* Waypoint Header */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="h-5 w-5 rounded-full bg-indigo-600 text-white font-bold text-[9px] flex items-center justify-center shrink-0">
                              {index + 1}
                            </div>
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                              {wp.placeName}
                            </span>
                          </div>

                          {/* Order & Delete actions */}
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => moveStop(index, 'up')}
                              disabled={index === 0}
                              className="p-1 rounded bg-slate-50 dark:bg-slate-800 text-slate-450 hover:bg-slate-100 dark:hover:bg-slate-700/80 disabled:opacity-30"
                            >
                              <ArrowUp className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveStop(index, 'down')}
                              disabled={index === customStops.length - 1}
                              className="p-1 rounded bg-slate-50 dark:bg-slate-800 text-slate-450 hover:bg-slate-100 dark:hover:bg-slate-700/80 disabled:opacity-30"
                            >
                              <ArrowDown className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleEditStop(wp.id)}
                              className="p-1 rounded bg-slate-50 dark:bg-slate-800 text-slate-450 hover:bg-slate-100 dark:hover:bg-slate-700/80"
                            >
                              {wp.editing ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteStop(index)}
                              className="p-1 rounded bg-rose-50 dark:bg-rose-950/20 text-rose-500 hover:bg-rose-100 dark:hover:bg-rose-900/35"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Accordion Waypoint Settings Details */}
                        {wp.editing && (
                          <div className="pt-2 border-t border-slate-50 dark:border-slate-800/40 space-y-2.5 animate-fade-in">
                            {/* Duration setting */}
                            <div className="flex items-center justify-between gap-3">
                              <label className="text-[10px] font-bold text-slate-450 dark:text-slate-500 uppercase tracking-wider">
                                Duration (mins)
                              </label>
                              <input
                                type="number"
                                value={wp.durationMin}
                                onChange={(e) => updateStopField(wp.id, 'durationMin', e.target.value)}
                                className="w-20 h-7 px-2 text-right text-xs bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              />
                            </div>

                            {/* Suggested Food spots setting */}
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-450 dark:text-slate-500 uppercase tracking-wider block">
                                Recommended Local Food spots
                              </label>
                              <input
                                type="text"
                                value={wp.foodSpots}
                                onChange={(e) => updateStopField(wp.id, 'foodSpots', e.target.value)}
                                placeholder="e.g. Saravana Bhavan, Local Tea Stall"
                                className="w-full h-8 px-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              />
                            </div>

                            {/* Photogenic points setting */}
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-450 dark:text-slate-500 uppercase tracking-wider block">
                                Scenic Photo Points
                              </label>
                              <input
                                type="text"
                                value={wp.photoPoints}
                                onChange={(e) => updateStopField(wp.id, 'photoPoints', e.target.value)}
                                placeholder="e.g. Sunset view from lake bridge, Courtyard gate"
                                className="w-full h-8 px-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center p-8 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[20px] text-center border-dashed">
                    <Compass className="h-8 w-8 text-slate-300 dark:text-slate-700 mb-2" />
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Your Route is Empty</span>
                    <p className="text-[10px] text-slate-400 mt-1 max-w-[200px]">Add stops by typing place names or pasting a Google Maps link above.</p>
                  </div>
                )}
              </div>

              {/* Cover Photo Selector */}
              <div className="space-y-2.5 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80 rounded-[20px] p-4 shadow-[0_2px_8px_rgba(0,0,0,0.01)] shrink-0 animate-fade-in">
                <span className="text-[10px] font-bold text-slate-450 dark:text-slate-500 uppercase tracking-wider block">
                  Select Trip Cover Photo
                </span>
                <div className="grid grid-cols-3 gap-2 mt-1">
                  {COVER_PRESETS.map((preset) => {
                    const isSelected = coverUrl === preset.url
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => setCoverUrl(preset.url)}
                        className={`relative h-14 rounded-xl overflow-hidden border-2 transition-all cursor-pointer ${
                          isSelected
                            ? 'border-indigo-600 scale-[1.02] shadow-sm'
                            : 'border-transparent hover:border-slate-200 dark:hover:border-slate-700'
                        }`}
                      >
                        <img
                          src={preset.url}
                          alt={preset.label}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-black/35 flex items-center justify-center">
                          <span className="text-[8px] font-extrabold text-white leading-none px-1 py-0.5 rounded bg-black/40">
                            {preset.label}
                          </span>
                        </div>
                        {isSelected && (
                          <div className="absolute top-1 right-1 h-3.5 w-3.5 rounded-full bg-indigo-600 flex items-center justify-center border border-white">
                            <span className="text-[7px] text-white font-bold">✓</span>
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
                {/* Custom URL input */}
                <div className="mt-2 pt-2 border-t border-slate-50 dark:border-slate-800/30">
                  <span className="text-[8px] font-bold text-slate-450 dark:text-slate-500 uppercase tracking-wider block mb-1">
                    Or Enter Custom Image URL
                  </span>
                  <input
                    type="text"
                    value={coverUrl}
                    onChange={(e) => setCoverUrl(e.target.value)}
                    placeholder="https://example.com/photo.jpg"
                    className="w-full h-8 px-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-100 font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Share Toggle */}
              <div className="flex items-center gap-2 py-1 select-none animate-fade-in">
                <input
                  type="checkbox"
                  id="isPublicCustom"
                  checked={isPublicCustom}
                  onChange={(e) => setIsPublicCustom(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 text-indigo-650 dark:text-indigo-500 focus:ring-indigo-500 cursor-pointer"
                />
                <label
                  htmlFor="isPublicCustom"
                  className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer"
                >
                  Share this itinerary with the community (Explore Feed)
                </label>
              </div>

              {/* Create Custom Route CTA Button */}
              <div className="pt-4 mt-auto">
                <button
                  type="button"
                  onClick={handleCreateCustomTrip}
                  disabled={generating}
                  className="w-full h-12 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white font-bold text-xs rounded-xl shadow-lg shadow-indigo-200 dark:shadow-none flex items-center justify-center gap-2 group transition-all duration-200 disabled:opacity-50 active:scale-[0.98]"
                >
                  <Compass className="h-4 w-4 group-hover:scale-110 transition-transform" />
                  Create Custom Trip
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  )
}
