'use server'

let mapplToken: string | null = null
let mapplTokenExpiry = 0

/**
 * Gets a valid Mappls token. First checks for direct MAPPLS_REST_API_KEY,
 * then falls back to Client ID / Client Secret OAuth2 flow.
 */
async function getMapplsToken(): Promise<string | null> {
  const apiKey = process.env.MAPPLS_REST_API_KEY
  const clientId = process.env.MAPPLS_CLIENT_ID
  const clientSecret = process.env.MAPPLS_CLIENT_SECRET

  if (apiKey) return apiKey

  if (!clientId || !clientSecret) return null

  // Check if cached token is still valid (with 1 min buffer)
  if (mapplToken && mapplTokenExpiry > Date.now() + 60000) {
    return mapplToken
  }

  try {
    const res = await fetch('https://outpost.mappls.com/api/security/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret
      })
    })

    if (!res.ok) {
      console.warn(`Failed to retrieve Mappls OAuth2 token: Status ${res.status}`)
      return null
    }

    const data = await res.json()
    if (data && data.access_token) {
      mapplToken = data.access_token
      mapplTokenExpiry = Date.now() + (parseInt(data.expires_in) || 3600) * 1000
      return mapplToken
    }
  } catch (err) {
    console.error('Error fetching Mappls OAuth token:', err)
  }
  return null
}

/**
 * Server-side geocoding function to search for coordinates of a place name.
 * Tries Mappls Geocoding API if keys are set; falls back to OpenStreetMap Nominatim.
 */
export async function geocodePlace(placeName: string): Promise<{ lat: number; lng: number } | null> {
  const cleanNameForSearch = placeName
    .replace(/\(.*?\)/g, '')
    .replace(/\[.*?\]/g, '')
    .trim()

  const token = await getMapplsToken()
  if (token) {
    try {
      const url = `https://search.mappls.com/search/address/geocode?address=${encodeURIComponent(cleanNameForSearch)}+India&access_token=${token}`
      const res = await fetch(url, {
        headers: { 'Accept-Language': 'en' },
        next: { revalidate: 86400 } // Cache for 24h
      })
      if (res.ok) {
        const data = await res.json()
        if (data && data.copResults && data.copResults.length > 0) {
          const first = data.copResults[0]
          if (first.latitude && first.longitude) {
            return {
              lat: parseFloat(first.latitude),
              lng: parseFloat(first.longitude)
            }
          }
        }
      }
    } catch (err) {
      console.warn(`Mappls geocoding failed for "${placeName}", falling back to Nominatim:`, err)
    }
  }

  // Fallback to OSM Nominatim API
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cleanNameForSearch)}+India&limit=1`
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'IndiaTravelPlanner/1.0 (contact@indiatravelplanner.local)',
        'Accept-Language': 'en'
      },
      next: { revalidate: 86400 }
    })

    if (res.ok) {
      const data = await res.json()
      if (data && data.length > 0) {
        return {
          lat: parseFloat(data[0].lat),
          lng: parseFloat(data[0].lon)
        }
      }
    }
  } catch (err) {
    console.error(`OSM Nominatim fallback geocoding failed for "${placeName}":`, err)
  }
  return null
}

export interface PlaceSuggestion {
  display_name: string
  lat: string | number
  lon: string | number
}

interface MapplsSuggestion {
  placeName: string
  placeAddress: string
  latitude: string | number
  longitude: string | number
}

/**
 * Server-side function to get autocomplete suggestions for place names.
 * Tries Mappls Auto Suggest API if keys are set; falls back to OpenStreetMap Nominatim.
 */
export async function getPlaceSuggestions(searchVal: string): Promise<PlaceSuggestion[]> {
  const token = await getMapplsToken()
  if (token) {
    try {
      const url = `https://atlas.mappls.com/api/places/search/json?query=${encodeURIComponent(searchVal)}&access_token=${token}`
      const res = await fetch(url, {
        headers: { 'Accept-Language': 'en' },
        next: { revalidate: 3600 } // Cache for 1h
      })
      if (res.ok) {
        const data = await res.json()
        if (data && data.suggestedLocations) {
          // Normalize to Nominatim structure so client UI components don't break
          return data.suggestedLocations.map((item: MapplsSuggestion) => ({
            display_name: `${item.placeName}, ${item.placeAddress}`,
            lat: parseFloat(String(item.latitude)) || 0,
            lon: parseFloat(String(item.longitude)) || 0
          }))
        }
      }
    } catch (err) {
      console.warn(`Mappls autocomplete suggestions failed for "${searchVal}", falling back to Nominatim:`, err)
    }
  }

  // Fallback to OSM Nominatim API
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchVal)}&limit=5`
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'IndiaTravelPlanner/1.0 (contact@indiatravelplanner.local)',
        'Accept-Language': 'en'
      },
      next: { revalidate: 3600 }
    })

    if (res.ok) {
      const data = await res.json()
      return data || []
    }
  } catch (err) {
    console.error(`OSM Nominatim fallback suggestions failed for "${searchVal}":`, err)
  }
  return []
}

/**
 * Reverse geocodes coordinates to a human-readable display address.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'IndiaTravelPlanner/1.0 (contact@indiatravelplanner.local)',
        'Accept-Language': 'en'
      },
      next: { revalidate: 86400 } // Cache for 24 hours
    })

    if (res.ok) {
      const data = await res.json()
      if (data && data.display_name) {
        return data.display_name
      }
    }
  } catch (err) {
    console.error('Reverse geocoding failed:', err)
  }
  return `Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`
}
