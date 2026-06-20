'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import Script from 'next/script'
import { Loader2, Navigation } from 'lucide-react'

export interface RouteStep {
  instruction: string
  distanceMeters: number
  durationSeconds: number
  type: string
  modifier?: string
}

interface OSRMStep {
  name?: string
  distance: number
  duration: number
  maneuver: {
    type: string
    modifier?: string
    instruction?: string
  }
}

interface OSRMLeg {
  steps?: OSRMStep[]
}

interface WaypointMapPoint {
  id: string
  placeName: string
  order: number
  lat: number
  lng: number
}

export interface ItineraryMapProps {
  waypoints: WaypointMapPoint[]
  activeWaypointId: string | null
  travelMode: 'driving' | 'two-wheeler' | 'walking'
  onRouteInfoUpdate?: (info: { distanceKm: number; durationMin: number } | null) => void
  onRouteStepsUpdate?: (steps: RouteStep[] | null) => void
  startTrip?: boolean
}

interface MapplsMarker {
  remove?: () => void
  getPosition?: () => { lat: number; lng: number }
  setPopup?: (html: string, options?: Record<string, unknown>) => void
  order?: number
  placeName?: string
}

interface MapplsMapInstance {
  panTo: (latLng: { lat: number; lng: number }) => void
  addListener: (event: string, callback: () => void) => void
}

interface MapplsInstance {
  Map: new (containerId: string, options: Record<string, unknown>) => MapplsMapInstance
  Marker: new (options: Record<string, unknown>) => MapplsMarker
  Polyline: new (options: Record<string, unknown>) => unknown
  fitBounds: new (options: Record<string, unknown>) => unknown
}

interface CustomWindow extends Window {
  mappls?: MapplsInstance
}

function getStepInstruction(step: OSRMStep): string {
  const maneuver = step.maneuver || {}
  const type = maneuver.type || ''
  const modifier = maneuver.modifier || ''
  const streetName = step.name || ''

  const street = streetName.trim() ? streetName : 'road'

  if (type === 'depart') {
    return `Head ${modifier ? modifier + ' ' : ''}on ${street}`
  }
  if (type === 'arrive') {
    return `Arrive at destination`
  }
  if (type === 'merge') {
    return `Merge onto ${street}`
  }
  if (type === 'fork') {
    return `Take the fork ${modifier ? modifier + ' ' : ''}onto ${street}`
  }
  if (type === 'off ramp') {
    return `Take the exit ramp onto ${street}`
  }
  if (type === 'on ramp') {
    return `Take the entrance ramp onto ${street}`
  }

  if (type === 'turn') {
    if (modifier === 'straight') return `Go straight onto ${street}`
    if (modifier === 'slight left') return `Slight left onto ${street}`
    if (modifier === 'slight right') return `Slight right onto ${street}`
    if (modifier === 'sharp left') return `Sharp left onto ${street}`
    if (modifier === 'sharp right') return `Sharp right onto ${street}`
    if (modifier === 'left') return `Turn left onto ${street}`
    if (modifier === 'right') return `Turn right onto ${street}`
    if (modifier === 'uturn') return `Make a U-turn onto ${street}`
    return `Turn ${modifier} onto ${street}`
  }

  if (type === 'roundabout') {
    return `Enter the roundabout and take exit onto ${street}`
  }

  if (type) {
    const action = type.charAt(0).toUpperCase() + type.slice(1)
    return `${action} ${modifier ? modifier + ' ' : ''}onto ${street}`
  }

  return `Continue onto ${street}`
}

export default function ItineraryMap({ waypoints, activeWaypointId, travelMode, onRouteInfoUpdate, onRouteStepsUpdate, startTrip = false }: ItineraryMapProps) {
  const mapplKey = process.env.NEXT_PUBLIC_MAPPLS_SDK_KEY
  
  // Sizing & engine states (defaults to Leaflet and upgrades if Mappls loads)
  const [mapEngine, setMapEngine] = useState<'leaflet' | 'mappls'>(() => {
    const hasMapplKey = !!mapplKey && typeof mapplKey === 'string' && mapplKey.trim() !== ''
    if (hasMapplKey && typeof window !== 'undefined') {
      const customWindow = window as unknown as CustomWindow
      if (customWindow.mappls) {
        return 'mappls'
      }
    }
    return 'leaflet'
  })
  const [mapplsLoaded, setMapplsLoaded] = useState(false)
  const [detailedRoute, setDetailedRoute] = useState<{ lat: number, lng: number }[] | null>(null)
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [locating, setLocating] = useState(false)
  
  // Common refs
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const leafletUserMarkerRef = useRef<L.Marker | null>(null)
  const mapplsUserMarkerRef = useRef<MapplsMarker | null>(null)
  
  // Leaflet refs
  const leafletMapRef = useRef<L.Map | null>(null)
  const leafletMarkersRef = useRef<{ [key: string]: L.Marker }>({})
  const leafletPolylineRef = useRef<L.Polyline | null>(null)

  // Mappls refs
  const mapplsMapRef = useRef<MapplsMapInstance | null>(null)
  const mapplsMarkersRef = useRef<{ [key: string]: MapplsMarker }>({})
  const mapplsPolylineRef = useRef<unknown | null>(null)

  // Determine if Mappls is configured
  const useMappls = !!mapplKey && typeof mapplKey === 'string' && mapplKey.trim() !== ''

  // Monitor Mappls script readiness is handled by lazy state initialization and onLoad callback

  // Fetch actual road network routing using free OSRM API
  useEffect(() => {
    let validWaypoints = waypoints.filter(wp => 
      wp.lat !== 0 && 
      wp.lng !== 0 && 
      wp.lat !== null && 
      wp.lng !== null && 
      typeof wp.lat !== 'undefined' && 
      typeof wp.lng !== 'undefined' && 
      !isNaN(Number(wp.lat)) && 
      !isNaN(Number(wp.lng))
    )

    if (startTrip && userLocation) {
      validWaypoints = [
        {
          id: 'current-location-start',
          placeName: 'Your Location',
          order: 0,
          lat: userLocation.lat,
          lng: userLocation.lng
        } as WaypointMapPoint,
        ...validWaypoints
      ]
    }

    if (validWaypoints.length < 2) {
      Promise.resolve().then(() => {
        setDetailedRoute(prev => prev === null ? null : null)
        if (onRouteInfoUpdate) {
          onRouteInfoUpdate(null)
        }
        if (onRouteStepsUpdate) {
          onRouteStepsUpdate(null)
        }
      })
      return
    }

    const fetchRoute = async () => {
      const profile = travelMode === 'walking' ? 'foot' : 'driving'

      // 1. Try to fetch the entire route in a single request first
      try {
        const coordsQuery = validWaypoints.map(wp => `${wp.lng},${wp.lat}`).join(';')
        const res = await fetch(`https://router.project-osrm.org/route/v1/${profile}/${coordsQuery}?overview=full&geometries=geojson&steps=true`)
        if (res.ok) {
          const data = await res.json()
          if (data && data.code === 'Ok' && data.routes && data.routes.length > 0) {
            const route = data.routes[0]
            const routeGeometry = route.geometry.coordinates.map(([lng, lat]: [number, number]) => ({
              lat,
              lng
            }))
            setDetailedRoute(routeGeometry)

            if (onRouteInfoUpdate) {
              const distanceKm = route.distance / 1000
              // Calculate walking time manually at 5 km/h if in walking mode to bypass OSRM demo server speed limitations
              const durationMin = travelMode === 'walking'
                ? distanceKm / 5 * 60
                : route.duration / 60
              onRouteInfoUpdate({ distanceKm, durationMin })
            }

            // Extract steps
            if (onRouteStepsUpdate) {
              const steps: RouteStep[] = []
              if (route.legs && Array.isArray(route.legs)) {
                route.legs.forEach((leg: OSRMLeg) => {
                  if (leg.steps && Array.isArray(leg.steps)) {
                    leg.steps.forEach((step: OSRMStep) => {
                      steps.push({
                        instruction: step.maneuver.instruction || getStepInstruction(step),
                        distanceMeters: step.distance,
                        durationSeconds: step.duration,
                        type: step.maneuver.type,
                        modifier: step.maneuver.modifier
                      })
                    })
                  }
                })
              }
              onRouteStepsUpdate(steps)
            }
            return
          }
        }
      } catch (err) {
        console.warn('Single-request route fetch failed, trying leg-by-leg routing:', err)
      }

      // 2. Fallback to leg-by-leg routing if the single request failed or returned NoRoute
      console.log('Resolving route leg-by-leg...')
      const legPromises = []
      
      interface LegResult {
        coordinates: { lat: number; lng: number }[]
        distance: number
        duration: number
        steps?: RouteStep[]
      }

      for (let i = 0; i < validWaypoints.length - 1; i++) {
        const start = validWaypoints[i]
        const end = validWaypoints[i + 1]
        
        const fetchLeg = async (): Promise<LegResult> => {
          try {
            const url = `https://router.project-osrm.org/route/v1/${profile}/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson&steps=true`
            const res = await fetch(url)
            if (res.ok) {
              const data = await res.json()
              if (data && data.code === 'Ok' && data.routes && data.routes.length > 0) {
                const route = data.routes[0]
                const legSteps: RouteStep[] = []
                if (route.legs && route.legs[0] && route.legs[0].steps) {
                  route.legs[0].steps.forEach((step: OSRMStep) => {
                    legSteps.push({
                      instruction: step.maneuver.instruction || getStepInstruction(step),
                      distanceMeters: step.distance,
                      durationSeconds: step.duration,
                      type: step.maneuver.type,
                      modifier: step.maneuver.modifier
                    })
                  })
                }
                return {
                  coordinates: route.geometry.coordinates.map(([lng, lat]: [number, number]) => ({
                    lat,
                    lng
                  })),
                  distance: route.distance,
                  duration: route.duration,
                  steps: legSteps
                }
              }
            }
          } catch (err) {
            console.warn(`Failed to fetch route leg from ${start.placeName} to ${end.placeName}:`, err)
          }
          // Fallback to straight line for this segment (approximate distance: Euclidean * 111000 meters)
          const dx = end.lng - start.lng
          const dy = end.lat - start.lat
          const approxDistMeters = Math.sqrt(dx*dx + dy*dy) * 111000
          const approxDurationSeconds = approxDistMeters / (profile === 'foot' ? 1.4 : 13.8) // 5km/h for walk, 50km/h for drive
          return {
            coordinates: [
              { lat: start.lat, lng: start.lng },
              { lat: end.lat, lng: end.lng }
            ],
            distance: approxDistMeters,
            duration: approxDurationSeconds,
            steps: [
              {
                instruction: `Head straight from ${start.placeName} to ${end.placeName}`,
                distanceMeters: approxDistMeters,
                durationSeconds: approxDurationSeconds,
                type: 'depart'
              },
              {
                instruction: `Arrive at ${end.placeName}`,
                distanceMeters: 0,
                durationSeconds: 0,
                type: 'arrive'
              }
            ]
          }
        }
        
        legPromises.push(fetchLeg())
      }

      try {
        const resolvedLegs = await Promise.all(legPromises)
        const fullRoute: { lat: number, lng: number }[] = []
        let totalDistanceMeters = 0
        let totalDurationSeconds = 0
        const fullSteps: RouteStep[] = []

        resolvedLegs.forEach((leg, index) => {
          totalDistanceMeters += leg.distance
          totalDurationSeconds += leg.duration

          if (index === 0) {
            fullRoute.push(...leg.coordinates)
          } else {
            fullRoute.push(...leg.coordinates.slice(1))
          }

          if (leg.steps) {
            fullSteps.push(...leg.steps)
          }
        })
        setDetailedRoute(fullRoute)

        if (onRouteInfoUpdate) {
          const distanceKm = totalDistanceMeters / 1000
          // Calculate walking time manually at 5 km/h if in walking mode to bypass OSRM demo server speed limitations
          const durationMin = travelMode === 'walking'
            ? distanceKm / 5 * 60
            : totalDurationSeconds / 60
          onRouteInfoUpdate({ distanceKm, durationMin })
        }

        if (onRouteStepsUpdate) {
          onRouteStepsUpdate(fullSteps)
        }
      } catch (err) {
        console.error('All routing attempts failed, falling back to straight lines:', err)
        setDetailedRoute(validWaypoints.map(wp => ({ lat: wp.lat, lng: wp.lng })))
        if (onRouteInfoUpdate) {
          onRouteInfoUpdate(null)
        }
        if (onRouteStepsUpdate) {
          const fallbackSteps: RouteStep[] = []
          for (let i = 0; i < validWaypoints.length - 1; i++) {
            fallbackSteps.push({
              instruction: `Proceed directly from ${validWaypoints[i].placeName} to ${validWaypoints[i+1].placeName}`,
              distanceMeters: 0,
              durationSeconds: 0,
              type: 'depart'
            })
          }
          onRouteStepsUpdate(fallbackSteps)
        }
      }
    }

    fetchRoute()
  }, [waypoints, travelMode, onRouteInfoUpdate, onRouteStepsUpdate, startTrip, userLocation])

  // Cleanup Leaflet map when switching to Mappls to avoid DOM conflicts
  useEffect(() => {
    if (mapEngine !== 'leaflet' && leafletMapRef.current) {
      try {
        leafletMapRef.current.stop()
        leafletMapRef.current.remove()
      } catch (e) {
        console.warn('Leaflet cleanup error:', e)
      }
      leafletMapRef.current = null
      leafletMarkersRef.current = {}
      leafletPolylineRef.current = null
    }
  }, [mapEngine])

  // Cleanup Mappls map when switching to Leaflet
  useEffect(() => {
    if (mapEngine !== 'mappls' && mapplsMapRef.current) {
      mapplsMapRef.current = null
      mapplsMarkersRef.current = {}
      mapplsPolylineRef.current = null
      setMapplsLoaded(false)
    }
  }, [mapEngine])

  // Cleanup on component unmount
  useEffect(() => {
    return () => {
      if (leafletMapRef.current) {
        try {
          leafletMapRef.current.stop()
          leafletMapRef.current.remove()
        } catch {
          // Leaflet removal failed silently
        }
        leafletMapRef.current = null
      }
    }
  }, [])

  // Render user location marker (Leaflet)
  useEffect(() => {
    if (mapEngine !== 'leaflet' || !leafletMapRef.current) return

    if (leafletUserMarkerRef.current) {
      leafletUserMarkerRef.current.remove()
      leafletUserMarkerRef.current = null
    }

    if (userLocation) {
      const locationIcon = L.divIcon({
        html: `
          <div class="relative flex items-center justify-center h-5 w-5">
            <div class="absolute inset-0 rounded-full bg-sky-400 opacity-75 animate-ping"></div>
            <div class="relative rounded-full h-3 w-3 bg-sky-500 border-2 border-white shadow-md"></div>
          </div>
        `,
        className: 'user-location-marker',
        iconSize: [20, 20],
        iconAnchor: [10, 10]
      })

      const marker = L.marker([userLocation.lat, userLocation.lng], { icon: locationIcon })
        .addTo(leafletMapRef.current)
        .bindPopup(`
          <div class="p-1 text-center font-sans">
            <strong class="text-xs text-sky-600 block">Your Current Location</strong>
          </div>
        `)
      
      leafletUserMarkerRef.current = marker
    }
  }, [userLocation, mapEngine])

  // Render user location marker (Mappls)
  useEffect(() => {
    if (mapEngine !== 'mappls' || !mapplsMapRef.current || !mapplsLoaded) return
    const customWindow = typeof window !== 'undefined' ? (window as unknown as CustomWindow) : null
    if (!customWindow || !customWindow.mappls) return
    const mappls = customWindow.mappls

    if (mapplsUserMarkerRef.current && mapplsUserMarkerRef.current.remove) {
      mapplsUserMarkerRef.current.remove()
      mapplsUserMarkerRef.current = null
    }

    if (userLocation) {
      const marker = new mappls.Marker({
        map: mapplsMapRef.current,
        position: userLocation,
        html: `
          <div class="relative flex items-center justify-center h-5 w-5">
            <div class="absolute inset-0 rounded-full bg-sky-400 opacity-75 animate-ping"></div>
            <div class="relative rounded-full h-3 w-3 bg-sky-500 border-2 border-white shadow-md"></div>
          </div>
        `,
        popupHtml: `
          <div class="p-1 text-center font-sans">
            <strong class="text-xs text-sky-600 block">Your Current Location</strong>
          </div>
        `,
        offset: [0, 0]
      })
      mapplsUserMarkerRef.current = marker
    }
  }, [userLocation, mapEngine, mapplsLoaded])

  // Cleanup User Markers on unmount
  useEffect(() => {
    return () => {
      if (leafletUserMarkerRef.current) {
        leafletUserMarkerRef.current.remove()
      }
      if (mapplsUserMarkerRef.current && mapplsUserMarkerRef.current.remove) {
        mapplsUserMarkerRef.current.remove()
      }
    }
  }, [])

  const handleLocateUser = useCallback(() => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      alert('Geolocation is not supported by your browser')
      return
    }

    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude
        const lng = position.coords.longitude
        setUserLocation({ lat, lng })
        setLocating(false)

        // Center map to user position
        if (mapEngine === 'leaflet' && leafletMapRef.current) {
          leafletMapRef.current.setView([lat, lng], 15)
        } else if (mapEngine === 'mappls' && mapplsMapRef.current) {
          mapplsMapRef.current.panTo({ lat, lng })
        }
      },
      (error) => {
        console.error('Geolocation query failed:', error)
        setLocating(false)
        alert(`Failed to retrieve your location: ${error.message}`)
      },
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 0
      }
    )
  }, [mapEngine])

  // Automatically query device location when startTrip is activated
  useEffect(() => {
    if (startTrip && !userLocation && !locating) {
      const timer = setTimeout(() => {
        handleLocateUser()
      }, 0)
      return () => clearTimeout(timer)
    }
  }, [startTrip, userLocation, locating, handleLocateUser])

  // --- LEAFLET MAP ENGINE ---
  useEffect(() => {
    if (mapEngine !== 'leaflet') return
    if (!mapContainerRef.current) return

    if (!leafletMapRef.current) {
      leafletMapRef.current = L.map(mapContainerRef.current, {
        zoomControl: false,
        attributionControl: false,
        zoomAnimation: false,
        fadeAnimation: false,
        markerZoomAnimation: false
      }).setView([20.5937, 78.9629], 5)

      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
      }).addTo(leafletMapRef.current)

      L.control.zoom({ position: 'topright' }).addTo(leafletMapRef.current)

      // Force initial size invalidation after DOM rendering completes to prevent grey maps
      setTimeout(() => {
        if (leafletMapRef.current) {
          leafletMapRef.current.invalidateSize()
        }
      }, 100)
    }

    const map = leafletMapRef.current

    // Clear previous markers & polylines
    Object.values(leafletMarkersRef.current).forEach((m) => m.remove())
    leafletMarkersRef.current = {}

    if (leafletPolylineRef.current) {
      leafletPolylineRef.current.remove()
      leafletPolylineRef.current = null
    }

    const validWaypoints = waypoints.filter(wp => 
      wp.lat !== 0 && 
      wp.lng !== 0 && 
      wp.lat !== null && 
      wp.lng !== null && 
      typeof wp.lat !== 'undefined' && 
      typeof wp.lng !== 'undefined' && 
      !isNaN(Number(wp.lat)) && 
      !isNaN(Number(wp.lng))
    )
    if (validWaypoints.length === 0) return

    const coordinates: L.LatLngTuple[] = []

    if (startTrip && userLocation) {
      coordinates.push([userLocation.lat, userLocation.lng])
    }

    validWaypoints.forEach((wp) => {
      const position: L.LatLngTuple = [wp.lat, wp.lng]
      coordinates.push(position)

      const customIcon = L.divIcon({
        html: `
          <div class="flex items-center justify-center w-7 h-7 rounded-full bg-indigo-600 text-white font-extrabold text-xs shadow-md border-2 border-white ring-2 ring-indigo-600/30 transition-transform duration-200 hover:scale-110">
            ${wp.order}
          </div>
        `,
        className: 'custom-map-marker',
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      })

      const marker = L.marker(position, { icon: customIcon })
        .addTo(map)
        .bindPopup(`
          <div class="p-1.5 font-sans">
            <span class="block text-[10px] font-bold text-indigo-600 uppercase">Stop ${wp.order}</span>
            <strong class="block text-xs text-slate-800 font-extrabold mt-0.5">${wp.placeName}</strong>
          </div>
        `)

      leafletMarkersRef.current[wp.id] = marker
    })

    const polylineCoords = detailedRoute ? detailedRoute.map(c => [c.lat, c.lng] as L.LatLngTuple) : coordinates
    if (polylineCoords.length > 1) {
      leafletPolylineRef.current = L.polyline(polylineCoords, {
        color: '#4f46e5',
        weight: 3.5,
        opacity: 0.85,
        dashArray: '8, 8',
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(map)
    }

    // Invalidate map size to force redraw and correctly scale
    map.invalidateSize()

    try {
      const bounds = L.latLngBounds(coordinates)
      map.fitBounds(bounds, { animate: false, padding: [40, 40] })
    } catch (e) {
      console.error('Fit bounds error:', e)
    }

    // Schedule progressive size invalidations to handle dynamic parent layout updates
    const timers = [100, 300, 700, 1200].map(delay =>
      setTimeout(() => {
        if (leafletMapRef.current) {
          leafletMapRef.current.invalidateSize()
        }
      }, delay)
    )

    const handleResize = () => {
      if (leafletMapRef.current) {
        leafletMapRef.current.invalidateSize()
      }
    }
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      timers.forEach(t => clearTimeout(t))
    }
  }, [waypoints, mapEngine, detailedRoute, startTrip, userLocation])

  // Center/popup on active selection (Leaflet)
  useEffect(() => {
    if (mapEngine !== 'leaflet') return
    const map = leafletMapRef.current
    if (!map || !activeWaypointId) return

    const activeMarker = leafletMarkersRef.current[activeWaypointId]
    if (activeMarker) {
      const latLng = activeMarker.getLatLng()
      map.setView(latLng, 14, {
        animate: false
      })
      activeMarker.openPopup()
    }
  }, [activeWaypointId, mapEngine])


  // --- MAPPLS MAP ENGINE ---
  useEffect(() => {
    if (mapEngine !== 'mappls') return
    const customWindow = typeof window !== 'undefined' ? (window as unknown as CustomWindow) : null
    if (!customWindow || !customWindow.mappls) return
    const mappls = customWindow.mappls
    if (!mapContainerRef.current) return

    // Initialize Mappls Map
    if (!mapplsMapRef.current) {
      const mapInstance = new mappls.Map('mappls-map-container', {
        center: [20.5937, 78.9629],
        zoom: 5,
        zoomControl: true
      })
      mapplsMapRef.current = mapInstance
      mapInstance.addListener('load', () => {
        setMapplsLoaded(true)
      })
    }

    if (!mapplsLoaded) return

    const map = mapplsMapRef.current

    // Clear previous markers
    Object.values(mapplsMarkersRef.current).forEach((m) => {
      if (m && m.remove) m.remove()
    })
    mapplsMarkersRef.current = {}

    // Clear previous polyline
    if (mapplsPolylineRef.current) {
      const poly = mapplsPolylineRef.current as { remove?: () => void }
      if (poly.remove) {
        poly.remove()
      }
      mapplsPolylineRef.current = null
    }

    const validWaypoints = waypoints.filter(wp => 
      wp.lat !== 0 && 
      wp.lng !== 0 && 
      wp.lat !== null && 
      wp.lng !== null && 
      typeof wp.lat !== 'undefined' && 
      typeof wp.lng !== 'undefined' && 
      !isNaN(Number(wp.lat)) && 
      !isNaN(Number(wp.lng))
    )
    if (validWaypoints.length === 0) return

    const coordinates: { lat: number; lng: number }[] = []

    if (startTrip && userLocation) {
      coordinates.push({ lat: userLocation.lat, lng: userLocation.lng })
    }

    validWaypoints.forEach((wp) => {
      const position = { lat: wp.lat, lng: wp.lng }
      coordinates.push(position)

      const popupHtml = `
        <div class="p-1.5 font-sans">
          <span class="block text-[10px] font-bold text-indigo-650 uppercase">Stop ${wp.order}</span>
          <strong class="block text-xs text-slate-800 font-extrabold mt-0.5">${wp.placeName}</strong>
        </div>
      `

      // Custom HTML numbered Marker
      const marker = new mappls.Marker({
        map: map,
        position: position,
        html: `
          <div class="flex items-center justify-center w-7 h-7 rounded-full bg-indigo-600 text-white font-extrabold text-xs shadow-md border-2 border-white ring-2 ring-indigo-600/30 transition-transform duration-200 hover:scale-110">
            ${wp.order}
          </div>
        `,
        popupHtml: popupHtml,
        offset: [0, -10]
      })

      // Store order and placeName for dynamic popup opening
      marker.order = wp.order
      marker.placeName = wp.placeName

      mapplsMarkersRef.current[wp.id] = marker
    })

    // Draw route connecting waypoints
    const polylineCoords = detailedRoute || coordinates
    if (polylineCoords.length > 1) {
      mapplsPolylineRef.current = new mappls.Polyline({
        map: map,
        path: polylineCoords,
        strokeColor: '#4f46e5',
        strokeWeight: 4,
        strokeOpacity: 0.85
      })
    }

    // Fit bounds to show the entire route
    try {
      const boundsVal = coordinates.map(c => [c.lng, c.lat])
      new mappls.fitBounds({
        map: map,
        bounds: boundsVal,
        options: {
          padding: 60,
          duration: 1000
        }
      })
    } catch (e) {
      console.error('Mappls fitBounds error:', e)
    }

  }, [waypoints, mapEngine, mapplsLoaded, detailedRoute, startTrip, userLocation])

  // Center/popup on active selection (Mappls)
  useEffect(() => {
    if (mapEngine !== 'mappls') return
    const customWindow = typeof window !== 'undefined' ? (window as unknown as CustomWindow) : null
    if (!customWindow || !customWindow.mappls) return
    const map = mapplsMapRef.current
    if (!map || !activeWaypointId) return

    const activeMarker = mapplsMarkersRef.current[activeWaypointId]
    if (activeMarker && activeMarker.getPosition && activeMarker.setPopup) {
      const latLng = activeMarker.getPosition()
      map.panTo(latLng)
      
      const popupHtml = `
        <div class="p-1.5 font-sans">
          <span class="block text-[10px] font-bold text-indigo-650 uppercase">Stop ${activeMarker.order}</span>
          <strong class="block text-xs text-slate-800 font-extrabold mt-0.5">${activeMarker.placeName}</strong>
        </div>
      `
      activeMarker.setPopup(popupHtml, { openPopup: true })
    }
  }, [activeWaypointId, mapEngine, mapplsLoaded])

  return (
    <div className="w-full h-full relative">
      {useMappls && (
        <Script
          src={`https://sdk.mappls.com/map/sdk/web?v=3.0&access_token=${mapplKey}`}
          strategy="afterInteractive"
          onLoad={() => {
            const customWindow = typeof window !== 'undefined' ? (window as unknown as CustomWindow) : null
            if (customWindow?.mappls) {
              setMapEngine('mappls')
            }
          }}
          onError={() => {
            console.warn('Mappls SDK script failed to load. Falling back to Leaflet map.')
            setMapEngine('leaflet')
          }}
        />
      )}
      
      <div id="mappls-map-container" ref={mapContainerRef} className="w-full h-full bg-slate-100 dark:bg-slate-900" />
      
      <button
        type="button"
        onClick={handleLocateUser}
        disabled={locating}
        className="absolute bottom-4 right-4 z-[400] h-10 w-10 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg flex items-center justify-center text-indigo-650 dark:text-indigo-400 hover:bg-slate-50 dark:hover:bg-slate-800 active:scale-95 transition-all cursor-pointer"
        title="Locate Me"
      >
        {locating ? <Loader2 className="h-5 w-5 animate-spin" /> : <Navigation className="h-4 w-4 fill-indigo-600/10" />}
      </button>
      
      <style jsx global>{`
        .leaflet-container {
          font-family: inherit;
        }
        .leaflet-popup-content-wrapper {
          border-radius: 12px !important;
          box-shadow: 0 4px 20px -2px rgba(0,0,0,0.1) !important;
          border: 1px solid rgba(0,0,0,0.05);
        }
        .leaflet-popup-tip {
          box-shadow: 0 4px 20px -2px rgba(0,0,0,0.1) !important;
        }
      `}</style>
    </div>
  )
}
