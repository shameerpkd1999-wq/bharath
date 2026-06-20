export interface UserProfile {
  uid: string
  name: string
  email: string
  createdAt: string
}

export interface Trip {
  id: string
  userId: string
  userName: string
  title: string
  isPublic: boolean
  sourceText: string
  createdAt: string
  coverUrl?: string
  isMock?: boolean
  geminiError?: string
}

export interface Waypoint {
  id: string
  placeName: string
  order: number
  durationMin: number
  foodSpots: string[]
  photoPoints: string[]
  lat: number
  lng: number
}

export interface TripWithWaypoints extends Trip {
  waypoints: Waypoint[]
}
