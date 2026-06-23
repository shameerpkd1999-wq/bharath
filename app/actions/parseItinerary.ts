'use server'

import { GoogleGenAI } from '@google/genai'
import { db } from '@/lib/firebase'
import { collection, doc, setDoc, addDoc } from 'firebase/firestore'
import { Trip, Waypoint } from '@/types/travel'

export interface ParseItineraryResult {
  tripId: string
  success: boolean
  trip: Trip
  waypoints: Waypoint[]
  isMock: boolean
  isLocalFallback: boolean
  geminiError?: string
}

interface WaypointData {
  placeName: string
  order: number
  suggestedDurationMinutes: number
  localFoodSpots: string[]
  photoPoints: string[]
}

interface AIResponse {
  tripTitle: string
  waypoints: WaypointData[]
}

// -------------------------------------------------------------
// RICH OFFLINE REGIONAL DATA POOLS (21 items each)
// -------------------------------------------------------------

const jaipurPool = [
  {
    placeName: 'Hawa Mahal (Palace of Winds)',
    suggestedDurationMinutes: 60,
    localFoodSpots: ['Laxmi Mishthan Bhandar (LMB)', 'Wind View Cafe'],
    photoPoints: ['Hawa Mahal facade from street level']
  },
  {
    placeName: 'Amer Fort & Palace',
    suggestedDurationMinutes: 180,
    localFoodSpots: ['1135 AD Fort Restaurant', 'Amer Kulfi Stall'],
    photoPoints: ['Sheesh Mahal (Mirror Palace) reflections', 'Maota Lake viewpoint']
  },
  {
    placeName: 'City Palace Jaipur',
    suggestedDurationMinutes: 120,
    localFoodSpots: ['The Baradari Restaurant', 'City Palace Tea Stall'],
    photoPoints: ['Peacock Gate courtyards', 'Chandra Mahal facade']
  },
  {
    placeName: 'Jantar Mantar Observatory',
    suggestedDurationMinutes: 90,
    localFoodSpots: ['Rawat Mishthan Bhandar', 'Jantar Mantar Cafe'],
    photoPoints: ['Samrat Yantra sundial', 'Observatory geometry view']
  },
  {
    placeName: 'Nahargarh Fort Viewpoint',
    suggestedDurationMinutes: 120,
    localFoodSpots: ['Padao Restaurant', 'Nahargarh Sunset Cafe'],
    photoPoints: ['Sunset views over the Pink City', 'Fort defense walls']
  },
  {
    placeName: 'Jaigarh Fort',
    suggestedDurationMinutes: 100,
    localFoodSpots: ['Jaigarh Canteen', 'Fort Tea Stall'],
    photoPoints: ['Jaivana Cannon overlook', 'High hill vistas']
  },
  {
    placeName: 'Jal Mahal (Water Palace)',
    suggestedDurationMinutes: 60,
    localFoodSpots: ['Jal Mahal Chowpatty Stalls', 'Royal Heritage Cafe'],
    photoPoints: ['Jal Mahal floating in Man Sagar Lake']
  },
  {
    placeName: 'Galta Ji (Monkey Temple)',
    suggestedDurationMinutes: 90,
    localFoodSpots: ['Galta Ji Sweet Stall', 'Local Fruit Vendors'],
    photoPoints: ['Natural water springs and temple tanks']
  },
  {
    placeName: 'Albert Hall Museum',
    suggestedDurationMinutes: 90,
    localFoodSpots: ['Albert Bakery', 'Museum Cafe'],
    photoPoints: ['Albert Hall facade lit up at night']
  },
  {
    placeName: 'Birla Mandir Temple',
    suggestedDurationMinutes: 60,
    localFoodSpots: ['Birla Mandir Juice Center', 'Ganesh Sweets'],
    photoPoints: ['White marble temple facade at sunset']
  },
  {
    placeName: 'Patrika Gate (Jawahar Circle)',
    suggestedDurationMinutes: 60,
    localFoodSpots: ['Jawahar Circle Food Stalls', 'Patrika Juice Corner'],
    photoPoints: ['Colorful hand-painted arches of Patrika Gate']
  },
  {
    placeName: 'Johari Bazar (Gem & Market Tour)',
    suggestedDurationMinutes: 90,
    localFoodSpots: ['LMB Sweets', 'Johari Bazar Lassi Wala'],
    photoPoints: ['Bustling pink markets and jewelry shops']
  },
  {
    placeName: 'Bapu Bazar (Traditional Textile shopping)',
    suggestedDurationMinutes: 90,
    localFoodSpots: ['Bapu Bazar Kulfi Falooda', 'Sanjay Omelette'],
    photoPoints: ['Vibrant traditional textiles and leather goods']
  },
  {
    placeName: 'Chokhi Dhani Ethnic Village',
    suggestedDurationMinutes: 240,
    localFoodSpots: ['Traditional Rajasthani Thali', 'Sangri Dhaba'],
    photoPoints: ['Folk dance performances and mud houses']
  },
  {
    placeName: 'Sisodia Rani Ka Bagh (Royal Garden)',
    suggestedDurationMinutes: 90,
    localFoodSpots: ['Garden Cafe Jaipur', 'Sisodia Refreshments'],
    photoPoints: ['Terraced gardens and painted pavilions']
  },
  {
    placeName: 'Amrapali Museum',
    suggestedDurationMinutes: 80,
    localFoodSpots: ['Amrapali Cafe', 'MI Road Lassi Wala'],
    photoPoints: ['Exquisite historical silver jewelry collections']
  },
  {
    placeName: 'Anokhi Museum of Hand Printing',
    suggestedDurationMinutes: 90,
    localFoodSpots: ['Anokhi Cafe', 'Amer Road Chai'],
    photoPoints: ['Handblock print workshop area']
  },
  {
    placeName: 'Gaitore Ki Chhatriyan',
    suggestedDurationMinutes: 70,
    localFoodSpots: ['Gaitore Chai Stall', 'Local Kachori Vendor'],
    photoPoints: ['Intricate marble cenotaphs of royal rulers']
  },
  {
    placeName: 'Central Park Jaipur',
    suggestedDurationMinutes: 60,
    localFoodSpots: ['Central Park Juice Bar', 'Healthy Bites Cafe'],
    photoPoints: ['Tricolor flag and lush jogging tracks']
  },
  {
    placeName: 'Masala Chowk',
    suggestedDurationMinutes: 90,
    localFoodSpots: ['Samrat Ki Pyaz Kachori', 'Gopal Singh Kulfi'],
    photoPoints: ['Open-air street food court ambiance']
  },
  {
    placeName: 'Panna Meena Ka Kund',
    suggestedDurationMinutes: 80,
    localFoodSpots: ['Panna Meena Tea Stall', 'Stepwell Cafe'],
    photoPoints: ['Symmetrical yellow stepwell steps']
  }
]

const keralaPool = [
  {
    placeName: 'Alleppey Houseboat Station',
    suggestedDurationMinutes: 240,
    localFoodSpots: ['Vembanad Seafood Restaurant', 'Alleppey Local Toddy Shop Fish Curry'],
    photoPoints: ['Sunset view over Vembanad Lake canals']
  },
  {
    placeName: 'Munnar Tea Estates & Museum',
    suggestedDurationMinutes: 180,
    localFoodSpots: ['Saravana Bhavan Munnar', 'Munnar Tea Stall Banana Fritters'],
    photoPoints: ['Lush green tea garden carpets', 'Lockhart Gap viewpoint']
  },
  {
    placeName: 'Eravikulam National Park (Munnar)',
    suggestedDurationMinutes: 150,
    localFoodSpots: ['Eravikulam Cafe', 'Forest Dept Canteen'],
    photoPoints: ['Nilgiri Tahr mountain views']
  },
  {
    placeName: 'Mattupetty Dam & Lake (Munnar)',
    suggestedDurationMinutes: 90,
    localFoodSpots: ['Mattupetty Speedboat Stalls', 'Dam View Restaurant'],
    photoPoints: ['Reflections of hills on reservoir water']
  },
  {
    placeName: 'Kundala Lake (Munnar)',
    suggestedDurationMinutes: 90,
    localFoodSpots: ['Kundala Shikara Cafe', 'Local Roasted Corn Stall'],
    photoPoints: ['Shikara boats and cherry blossoms']
  },
  {
    placeName: 'Top Station Munnar Viewpoint',
    suggestedDurationMinutes: 120,
    localFoodSpots: ['Top Station Tea Stall', 'Maggi Point'],
    photoPoints: ['Panoramic valley view above the clouds']
  },
  {
    placeName: 'Fort Kochi (Chinese Fishing Nets)',
    suggestedDurationMinutes: 90,
    localFoodSpots: ['Oceanos Restaurant', 'Fort Kochi Fresh Fish Stall'],
    photoPoints: ['Casting of giant nets against sunset']
  },
  {
    placeName: 'Mattancherry Palace (Dutch Palace)',
    suggestedDurationMinutes: 90,
    localFoodSpots: ['Ginger House Restaurant', 'Mattancherry Chai'],
    photoPoints: ['Ancient murals and wood-carved ceilings']
  },
  {
    placeName: 'Jew Town & Paradesi Synagogue (Kochi)',
    suggestedDurationMinutes: 90,
    localFoodSpots: ['Kashi Art Cafe', 'Jew Town Spice Tea'],
    photoPoints: ['Antiques shops and narrow streets']
  },
  {
    placeName: 'Vembanad Lake (Kumarakom)',
    suggestedDurationMinutes: 120,
    localFoodSpots: ['Kumarakom Toddy Shop', 'Lake View Resort Diner'],
    photoPoints: ['Scenic water birds and coconut groves']
  },
  {
    placeName: 'Varkala Cliff & Beach',
    suggestedDurationMinutes: 180,
    localFoodSpots: ['Darjeeling Cafe Varkala', 'Abba Restaurant'],
    photoPoints: ['Dramatic red cliffs overlooking Arabian Sea']
  },
  {
    placeName: 'Kovalam Lighthouse Beach',
    suggestedDurationMinutes: 120,
    localFoodSpots: ['The Tides Restaurant', 'Kovalam German Bakery'],
    photoPoints: ['Red-and-white striped lighthouse view']
  },
  {
    placeName: 'Athirappilly Waterfalls',
    suggestedDurationMinutes: 150,
    localFoodSpots: ['Athirappilly Rainforest Cafe', 'Waterfall View Hotel'],
    photoPoints: ['Majestic Niagara of India cascade']
  },
  {
    placeName: 'Periyar National Park (Thekkady)',
    suggestedDurationMinutes: 180,
    localFoodSpots: ['Thekkady Spice Garden Cafe', 'Elephant Court Diner'],
    photoPoints: ['Wild elephants by Periyar lake shore']
  },
  {
    placeName: 'Kumarakom Bird Sanctuary',
    suggestedDurationMinutes: 120,
    localFoodSpots: ['Sanctuary Canteen', 'Backwater Bites'],
    photoPoints: ['Migratory birds in mangrove forests']
  },
  {
    placeName: 'Marari Beach',
    suggestedDurationMinutes: 150,
    localFoodSpots: ['Marari Beach Shack', 'Local Fish Curry Stall'],
    photoPoints: ['Serene white sands and palm trees']
  },
  {
    placeName: 'Bekal Fort Kasaragod',
    suggestedDurationMinutes: 120,
    localFoodSpots: ['Bekal Beach Restaurant', 'Kasaragod Biryani'],
    photoPoints: ['Keyhole-shaped fort walls meeting the sea']
  },
  {
    placeName: 'Wayanad Edakkal Caves',
    suggestedDurationMinutes: 150,
    localFoodSpots: ['Wayanad Cliff Resto', 'Cave Path Juice Bar'],
    photoPoints: ['Neolithic stone carvings inside caves']
  },
  {
    placeName: 'Banasura Sagar Dam',
    suggestedDurationMinutes: 100,
    localFoodSpots: ['Banasura Dam Canteen', 'Hill View Tea'],
    photoPoints: ['Largest earthen dam in India']
  },
  {
    placeName: 'Poovar Island Backwaters',
    suggestedDurationMinutes: 120,
    localFoodSpots: ['Poovar Floating Restaurant', 'Island Seafood Cafe'],
    photoPoints: ['Estuary where river meets the sea']
  },
  {
    placeName: 'Kochi Marine Drive',
    suggestedDurationMinutes: 90,
    localFoodSpots: ['Marine Drive Food Court', 'Rainbow Bridge Chai'],
    photoPoints: ['Sunset cruise on Kochi backwaters']
  }
]

const goaPool = [
  {
    placeName: 'Basilica of Bom Jesus (Old Goa)',
    suggestedDurationMinutes: 90,
    localFoodSpots: ['Viva Panjim Goan Cuisine', 'Bom Jesus Coconut Water Stall'],
    photoPoints: ['Baroque facade of Basilica of Bom Jesus']
  },
  {
    placeName: 'Se Cathedral (Old Goa)',
    suggestedDurationMinutes: 90,
    localFoodSpots: ['Old Goa Spice Cafe', 'Cathedral Refreshments'],
    photoPoints: ['Tuscan style architecture and golden bell']
  },
  {
    placeName: 'Fontainhas Latin Quarter',
    suggestedDurationMinutes: 90,
    localFoodSpots: ['Confeitaria 31 de Janeiro', 'Verandah Restaurant'],
    photoPoints: ['Vibrant yellow and blue Portuguese houses']
  },
  {
    placeName: 'Baga Beach Shoreline',
    suggestedDurationMinutes: 180,
    localFoodSpots: ['Britto’s Beach Shack', 'Local Goan Fish Thali Dhaba'],
    photoPoints: ['Sunset views from Baga beach cliffs']
  },
  {
    placeName: 'Calangute Beach Coast',
    suggestedDurationMinutes: 180,
    localFoodSpots: ['Souza Lobo Restaurant', 'Calangute Juice Corner'],
    photoPoints: ['Parasailers over the Goan sea']
  },
  {
    placeName: 'Fort Aguada & Lighthouse',
    suggestedDurationMinutes: 120,
    localFoodSpots: ['Aguada Fort Cafe', 'Sinquerim Beach Bites'],
    photoPoints: ['Seventeenth-century lighthouse and sea wall']
  },
  {
    placeName: 'Anjuna Flea Market',
    suggestedDurationMinutes: 180,
    localFoodSpots: ['Curlies Beach Shack', 'Anjuna Organic Cafe'],
    photoPoints: ['Colorful hippie stalls and ocean breeze']
  },
  {
    placeName: 'Vagator Beach & Cliffs',
    suggestedDurationMinutes: 120,
    localFoodSpots: ['Thalassa Greek Restaurant', 'Vagator Coconut Stall'],
    photoPoints: ['Shiva carved rock face on the beach']
  },
  {
    placeName: 'Chapora Fort',
    suggestedDurationMinutes: 90,
    localFoodSpots: ['Chapora Juice Center', 'Fort View Dhaba'],
    photoPoints: ['Panoramic sea view from dil chahta hai fort']
  },
  {
    placeName: 'Dudhsagar Waterfalls Trek',
    suggestedDurationMinutes: 240,
    localFoodSpots: ['Trekker\'s Buffet', 'Jungle Cafe'],
    photoPoints: ['Four-tiered waterfall with passing train']
  },
  {
    placeName: 'Sahakari Spice Farm Tour',
    suggestedDurationMinutes: 150,
    localFoodSpots: ['Traditional Goan Buffet', 'Lemongrass Chai'],
    photoPoints: ['Lush vanilla and pepper spice plants']
  },
  {
    placeName: 'Panaji River Cruise (Mandovi)',
    suggestedDurationMinutes: 90,
    localFoodSpots: ['Mandovi Cruise Snacks', 'Panjim Fish Fry'],
    photoPoints: ['Night lights of Panaji from Mandovi river']
  },
  {
    placeName: 'Palolem Beach (South Goa)',
    suggestedDurationMinutes: 180,
    localFoodSpots: ['Dropadi Restaurant Palolem', 'Palolem Beach Shacks'],
    photoPoints: ['Crescent-shaped beach with coco palms']
  },
  {
    placeName: 'Cabo de Rama Fort',
    suggestedDurationMinutes: 120,
    localFoodSpots: ['Cabo de Rama Beach shack', 'Cliff Edge Soda'],
    photoPoints: ['Cliffs rising directly from the blue sea']
  },
  {
    placeName: 'Colva Beach & Pier',
    suggestedDurationMinutes: 150,
    localFoodSpots: ['Kentuckee Seafood', 'Colva Ice Cream Stall'],
    photoPoints: ['White sand dunes and fishing boats']
  },
  {
    placeName: 'Arambol Sweet Water Lake',
    suggestedDurationMinutes: 120,
    localFoodSpots: ['Arambol Beach Shack', 'Sweet Water Cafe'],
    photoPoints: ['Freshwater lagoon next to the sea']
  },
  {
    placeName: 'Morjim Beach (Turtle Beach)',
    suggestedDurationMinutes: 150,
    localFoodSpots: ['La Plage Morjim', 'Olive Ridley Restaurant'],
    photoPoints: ['Nesting sites and quiet sandy shores']
  },
  {
    placeName: 'Dona Paula Viewpoint',
    suggestedDurationMinutes: 90,
    localFoodSpots: ['Dona Paula Jetty Snacks', 'Coconut Water Corner'],
    photoPoints: ['Meeting point of Zuari and Mandovi rivers']
  },
  {
    placeName: 'St. Augustine Tower ruins',
    suggestedDurationMinutes: 70,
    localFoodSpots: ['Old Goa Bakery', 'Augustine Cafe'],
    photoPoints: ['46-meter high broken church tower']
  },
  {
    placeName: 'Margao Municipal Market',
    suggestedDurationMinutes: 100,
    localFoodSpots: ['Margao Fish Market Thali', 'Royal Bakery Margao'],
    photoPoints: ['Spices and local Goan sausages']
  },
  {
    placeName: 'Mangeshi Temple',
    suggestedDurationMinutes: 80,
    localFoodSpots: ['Mangeshi Prasadam Stall', 'Local South Indian Canteen'],
    photoPoints: ['Deepastambha lamp tower in courtyard']
  }
]

const ootyPool = [
  {
    placeName: 'Ooty Lake & Boathouse',
    suggestedDurationMinutes: 90,
    localFoodSpots: ['Ooty Coffee House', 'Homemade Chocolates Stall'],
    photoPoints: ['Boating reflections on the misty waters']
  },
  {
    placeName: 'Ooty Botanical Gardens',
    suggestedDurationMinutes: 90,
    localFoodSpots: ['Nilgiri Tea Junction', 'Garden Cafe Fritters'],
    photoPoints: ['Lush lawns and fossil tree trunk']
  },
  {
    placeName: 'Doddabetta Peak Viewpoint',
    suggestedDurationMinutes: 120,
    localFoodSpots: ['Peak Maggi Stall', 'Nilgiri Spiced Tea Kettle'],
    photoPoints: ['High altitude valley vista from telescope house']
  },
  {
    placeName: 'Rose Garden (Ooty)',
    suggestedDurationMinutes: 90,
    localFoodSpots: ['Rose Garden Cafe', 'Local Fruit Corner'],
    photoPoints: ['Thousands of blooming rose varieties']
  },
  {
    placeName: 'Nilgiri Mountain Railway',
    suggestedDurationMinutes: 180,
    localFoodSpots: ['Mettupalayam Toy Train Snacks', 'Station Tea'],
    photoPoints: ['Toy train passing over arched stone bridges']
  },
  {
    placeName: 'Pykara Waterfalls & Lake',
    suggestedDurationMinutes: 120,
    localFoodSpots: ['Pykara Boat House Restaurant', 'Pykara Chai Stall'],
    photoPoints: ['Cascading water over pine-covered rocks']
  },
  {
    placeName: 'Pine Forest Ooty',
    suggestedDurationMinutes: 80,
    localFoodSpots: ['Pine Forest Roasted Corn Stall', 'Local Ginger Tea'],
    photoPoints: ['Tall pine trees and sunbeams']
  },
  {
    placeName: 'Shooting Point (9th Mile)',
    suggestedDurationMinutes: 90,
    localFoodSpots: ['Shooting Point Maggi', 'Spiced Corn Stall'],
    photoPoints: ['Rolling green downs from Bollywood movies']
  },
  {
    placeName: 'Emerald Lake Ooty',
    suggestedDurationMinutes: 120,
    localFoodSpots: ['Emerald Lake View Tea', 'Hilltop Cafe'],
    photoPoints: ['Serene blue lake surrounded by tea slopes']
  },
  {
    placeName: 'Avalanche Lake Sanctuary',
    suggestedDurationMinutes: 150,
    localFoodSpots: ['Avalanche Forest Canteen', 'Campfire Snacks'],
    photoPoints: ['Trout fishing lake and thick woods']
  },
  {
    placeName: 'Tea Museum & Factory',
    suggestedDurationMinutes: 90,
    localFoodSpots: ['Free Fresh Tea Samples', 'Tea Factory Biscuit Shop'],
    photoPoints: ['Tea leaves processing machines']
  },
  {
    placeName: 'Wax World Museum',
    suggestedDurationMinutes: 60,
    localFoodSpots: ['Wax Museum Snacks', 'Ooty Sweet Corner'],
    photoPoints: ['Lifelike wax statues of historic figures']
  },
  {
    placeName: 'Coonoor Sim\'s Park',
    suggestedDurationMinutes: 90,
    localFoodSpots: ['Sim\'s Park Tea Stall', 'Coonoor Bakery'],
    photoPoints: ['Rare species of temperate plants']
  },
  {
    placeName: 'Dolphin\'s Nose Viewpoint (Coonoor)',
    suggestedDurationMinutes: 90,
    localFoodSpots: ['Dolphin\'s Nose Tea Stall', 'Peak View Maggi'],
    photoPoints: ['Catherine Falls view in the distance']
  },
  {
    placeName: 'Lamb\'s Rock (Coonoor)',
    suggestedDurationMinutes: 90,
    localFoodSpots: ['Lamb\'s Rock Fruit Stall', 'Coonoor Spiced Tea'],
    photoPoints: ['Vast tea estate plains below the cliff']
  },
  {
    placeName: 'Kamraj Sagar Dam',
    suggestedDurationMinutes: 90,
    localFoodSpots: ['Dam View Fish Fry', 'Sagar Tea Stall'],
    photoPoints: ['Pine forests sloping down to reservoir']
  },
  {
    placeName: 'Ketty Valley View',
    suggestedDurationMinutes: 80,
    localFoodSpots: ['Ketty Valley Tea Stall', 'Valley View Restaurant'],
    photoPoints: ['Beautiful valley view containing small villages']
  },
  {
    placeName: 'Stone House Ooty',
    suggestedDurationMinutes: 90,
    localFoodSpots: ['Stone House Canteen', 'Old Town Bakery'],
    photoPoints: ['First bungalow built in Ooty in 1822']
  },
  {
    placeName: 'St. Stephen\'s Church',
    suggestedDurationMinutes: 70,
    localFoodSpots: ['Stephen\'s Coffee Shop', 'Ooty Bun Butter Jam'],
    photoPoints: ['Gothic style architecture and stained glass']
  },
  {
    placeName: 'Mudumalai National Park',
    suggestedDurationMinutes: 240,
    localFoodSpots: ['Jungle Lodges Dining', 'Wildlife Cafe'],
    photoPoints: ['Elephant safari in the deciduous forest']
  },
  {
    placeName: 'Coonoor Tea Gardens',
    suggestedDurationMinutes: 120,
    localFoodSpots: ['Highfield Tea Factory Cafe', 'Coonoor Tea Stall'],
    photoPoints: ['Tea pickers working on step estates']
  }
]

const kodaiPool = [
  {
    placeName: 'Kodaikanal Lake',
    suggestedDurationMinutes: 90,
    localFoodSpots: ['Lakeview Sidewalk Cafe', 'Hot Cheese Toast Stall'],
    photoPoints: ['Mist rolling over star-shaped Kodaikanal Lake']
  },
  {
    placeName: 'Coaker\'s Walk',
    suggestedDurationMinutes: 60,
    localFoodSpots: ['Cloud Street Bakery', 'Fresh Plum Stall'],
    photoPoints: ['Valley views along the edge of the ridge path']
  },
  {
    placeName: 'Pillar Rocks Viewpoint',
    suggestedDurationMinutes: 90,
    localFoodSpots: ['Kodai Tea Stall', 'Misty Mountain Café snacks'],
    photoPoints: ['Three granite pillars rising from the fog']
  },
  {
    placeName: 'Kodaikanal Pine Forest',
    suggestedDurationMinutes: 80,
    localFoodSpots: ['Pine Forest Roasted Corn Stall', 'Local Ginger Tea'],
    photoPoints: ['Symmetrical pine trees and sunbeams']
  },
  {
    placeName: 'Bryant Park Gardens',
    suggestedDurationMinutes: 90,
    localFoodSpots: ['Bryant Park Juice Bar', 'Parkside Tea Stall'],
    photoPoints: ['Vibrant flower beds and glasshouse']
  },
  {
    placeName: 'Guna Caves (Devil\'s Kitchen)',
    suggestedDurationMinutes: 90,
    localFoodSpots: ['Guna Cave Tea Stall', 'Spiced Mango Stall'],
    photoPoints: ['Deep dark rock chambers and tree roots']
  },
  {
    placeName: 'Green Valley View',
    suggestedDurationMinutes: 80,
    localFoodSpots: ['Valley View Maggi', 'Kodai Homemade Chocolates'],
    photoPoints: ['5000-foot drop view of Vaigai Dam']
  },
  {
    placeName: 'Silver Cascade Falls',
    suggestedDurationMinutes: 60,
    localFoodSpots: ['Waterfall Side Fruit Stall', 'Cascade Tea Stall'],
    photoPoints: ['Thirst-quenching waterfall right by the highway']
  },
  {
    placeName: 'Dolphin\'s Nose Kodai',
    suggestedDurationMinutes: 150,
    localFoodSpots: ['Dolphin\'s Nose Mountain Cafe', 'Hilltop Maggi'],
    photoPoints: ['Flat projecting rock looking over deep valley']
  },
  {
    placeName: 'Bear Shola Falls',
    suggestedDurationMinutes: 90,
    localFoodSpots: ['Forest Path Canteen', 'Local Tea Shop'],
    photoPoints: ['Quiet waterfall hidden inside reserve forest']
  },
  {
    placeName: 'Kurinji Andavar Temple',
    suggestedDurationMinutes: 60,
    localFoodSpots: ['Temple Prasadam Stall', 'Kurinji Sweet Stall'],
    photoPoints: ['Temple dedicated to Kurinji flower']
  },
  {
    placeName: 'Moir Point Viewpoint',
    suggestedDurationMinutes: 80,
    localFoodSpots: ['Moir Point Snacks', 'Kodai Chai Stall'],
    photoPoints: ['First road-laying point overlooking hills']
  },
  {
    placeName: 'Chettiyar Park',
    suggestedDurationMinutes: 80,
    localFoodSpots: ['Chettiyar Park Cafe', 'Local Fruit Vendors'],
    photoPoints: ['Quiet manicured lawn and play area']
  },
  {
    placeName: 'Berijam Lake Reserve',
    suggestedDurationMinutes: 180,
    localFoodSpots: ['Berijam Forest Canteen', 'Eco Club Diner'],
    photoPoints: ['Pristine freshwater forest lake']
  },
  {
    placeName: 'Silent Valley View',
    suggestedDurationMinutes: 90,
    localFoodSpots: ['Silent Valley Tea Stall', 'Misty Valley Snacks'],
    photoPoints: ['Unbelievable depth view of green mountains']
  },
  {
    placeName: 'Kurinji Flower Garden',
    suggestedDurationMinutes: 80,
    localFoodSpots: ['Kurinji Cafe', 'Fresh Juice Stall'],
    photoPoints: ['Shrubs that bloom once in 12 years']
  },
  {
    placeName: 'La Saleth Church',
    suggestedDurationMinutes: 70,
    localFoodSpots: ['Saleth Church Tea Stall', 'Kodai Bakery'],
    photoPoints: ['Beautiful blue and white historical church']
  },
  {
    placeName: 'Perumal Peak Trek',
    suggestedDurationMinutes: 240,
    localFoodSpots: ['Trekker\'s Trail Energy Bars', 'Peak Side Tea'],
    photoPoints: ['Highest peak in Western Ghats Western Palani Hills']
  },
  {
    placeName: 'Shembaganur Museum',
    suggestedDurationMinutes: 90,
    localFoodSpots: ['Museum Canteen', 'College Road Lassi'],
    photoPoints: ['100-year old taxidermy and orchid garden']
  },
  {
    placeName: 'Fairy Falls',
    suggestedDurationMinutes: 60,
    localFoodSpots: ['Fairy Falls Tea Stall', 'Roasted Chickpea Stall'],
    photoPoints: ['Crystal clear water swimming pool at bottom']
  },
  {
    placeName: 'Mannavanur Lake Eco-Tourism',
    suggestedDurationMinutes: 180,
    localFoodSpots: ['Mannavanur Sheep Farm Cafe', 'Local Village Tea'],
    photoPoints: ['Grasslands and sheep farm mimicking Switzerland']
  }
]

const goldenTrianglePool = [
  {
    placeName: 'Red Fort & Old Delhi Markets',
    suggestedDurationMinutes: 120,
    localFoodSpots: ['Karim’s Restaurant Old Delhi', 'Natraj Dahi Bhalla Corner'],
    photoPoints: ['Lahori Gate red sandstone arches', 'Chandni Chowk streets']
  },
  {
    placeName: 'Taj Mahal Monument',
    suggestedDurationMinutes: 180,
    localFoodSpots: ['Pinch of Spice Restaurant Agra', 'Agra Petha Sweet Stall'],
    photoPoints: ['Reflecting pool front view of the Taj Mahal', 'Yamuna River sunrise point']
  },
  {
    placeName: 'Agra Fort & Yamuna View',
    suggestedDurationMinutes: 120,
    localFoodSpots: ['Agra Fort Canteen', 'Jahangiri Mahal Tea'],
    photoPoints: ['Red sandstone fortress walls and Taj view']
  },
  {
    placeName: 'Humayun\'s Tomb',
    suggestedDurationMinutes: 120,
    localFoodSpots: ['Nizamuddin Kebabs', 'Humayun\'s Tomb Cafe'],
    photoPoints: ['Mughal garden tomb symmetry']
  },
  {
    placeName: 'Qutub Minar Complex',
    suggestedDurationMinutes: 100,
    localFoodSpots: ['Qutub Area South Indian', 'Minar Juice Center'],
    photoPoints: ['Tallest brick minaret in the world']
  },
  {
    placeName: 'Lotus Temple',
    suggestedDurationMinutes: 90,
    localFoodSpots: ['Kalkaji Temple Sweets', 'Lotus Cafe'],
    photoPoints: ['Petal-shaped marble temple architecture']
  },
  {
    placeName: 'India Gate & Kartavya Path',
    suggestedDurationMinutes: 90,
    localFoodSpots: ['Pandara Road Gulati', 'India Gate Ice Cream Cart'],
    photoPoints: ['War memorial arch lit up at sunset']
  },
  {
    placeName: 'Chandni Chowk & Jama Masjid',
    suggestedDurationMinutes: 150,
    localFoodSpots: ['Paranthe Wali Gali', 'Old Delhi Jalebi Wala'],
    photoPoints: ['Courtyard of Jama Masjid and narrow streets']
  },
  {
    placeName: 'Mehtab Bagh Sunset View',
    suggestedDurationMinutes: 90,
    localFoodSpots: ['Agra River Cafe', 'Mehtab Bagh Coconut Water'],
    photoPoints: ['Taj Mahal reflection across Yamuna River']
  },
  {
    placeName: 'Fatehpur Sikri Royal Complex',
    suggestedDurationMinutes: 150,
    localFoodSpots: ['Fatehpur Sikri Dhaba', 'Buland Tea Stall'],
    photoPoints: ['Diwan-i-Khas carved pillar']
  },
  {
    placeName: 'Buland Darwaza',
    suggestedDurationMinutes: 80,
    localFoodSpots: ['Sikri Sweet Stall', 'Royal Biryani'],
    photoPoints: ['Highest gateway in the world at Fatehpur Sikri']
  },
  {
    placeName: 'Akshardham Temple',
    suggestedDurationMinutes: 180,
    localFoodSpots: ['Premvati Food Court', 'Akshardham Milk Corner'],
    photoPoints: ['Carved pink stone temple and water show']
  },
  {
    placeName: 'Amber Palace Jaipur',
    suggestedDurationMinutes: 180,
    localFoodSpots: ['1135 AD Restaurant', 'Amer Kulfi Stall'],
    photoPoints: ['Sheesh Mahal mirror gallery reflections']
  },
  {
    placeName: 'Hawa Mahal (Jaipur)',
    suggestedDurationMinutes: 60,
    localFoodSpots: ['Laxmi Mishthan Bhandar', 'Wind View Cafe'],
    photoPoints: ['Symmetrical pink windows facade']
  },
  {
    placeName: 'Connaught Place (Delhi)',
    suggestedDurationMinutes: 120,
    localFoodSpots: ['Wenger\'s Bakery', 'Keventers Milkshake CP'],
    photoPoints: ['White colonnaded corridors of CP']
  },
  {
    placeName: 'National Museum Delhi',
    suggestedDurationMinutes: 120,
    localFoodSpots: ['National Museum Cafe', 'Janpath Chaat Stall'],
    photoPoints: ['Harappan civilization dancing girl gallery']
  },
  {
    placeName: 'Lodi Gardens',
    suggestedDurationMinutes: 90,
    localFoodSpots: ['Lodi - The Garden Restaurant', 'Khan Market Lassi'],
    photoPoints: ['Sayyid and Lodi dynasty tombs in green park']
  },
  {
    placeName: 'Jama Masjid Old Delhi',
    suggestedDurationMinutes: 120,
    localFoodSpots: ['Al Jawahar Restaurant', 'Mohabbat Ka Sharbat'],
    photoPoints: ['Minarets overlooking busy Bazaar streets']
  },
  {
    placeName: 'Itmad-ud-Daulah (Agra)',
    suggestedDurationMinutes: 90,
    localFoodSpots: ['Agra Baby Taj Cafe', 'Mughal Spice Restaurant'],
    photoPoints: ['Pietra dura marble inlay on Baby Taj']
  },
  {
    placeName: 'Sikandra Akbar\'s Tomb',
    suggestedDurationMinutes: 90,
    localFoodSpots: ['Sikandra Lassi Corner', 'Akbar Tomb Tea Stall'],
    photoPoints: ['Deer roaming in green red sandstone tomb park']
  },
  {
    placeName: 'Raj Ghat Memorial',
    suggestedDurationMinutes: 90,
    localFoodSpots: ['Delhi Raj Ghat Canteen', 'Gandhi Smriti Tea Shop'],
    photoPoints: ['Black marble platform Gandhi memorial eternal flame']
  }
]

// Helper function to generate high-fidelity mock itinerary recommendations in India
function generateMockItinerary(text: string, duration: number, budget: string, companions: string): AIResponse {
  const lowercaseText = text.toLowerCase()
  const bTier = budget.charAt(0).toUpperCase() + budget.slice(1)
  const group = companions.charAt(0).toUpperCase() + companions.slice(1)

  // 1. Select the appropriate mock pool
  let pool: Array<{ placeName: string; localFoodSpots: string[]; photoPoints: string[]; suggestedDurationMinutes?: number }> = []
  let regionName = "Indian Discovery"

  if (lowercaseText.includes('jaipur') || lowercaseText.includes('rajasthan')) {
    pool = jaipurPool
    regionName = "Jaipur & Rajasthan Heritage"
  } else if (lowercaseText.includes('kerala') || lowercaseText.includes('alleppey') || lowercaseText.includes('munnar')) {
    pool = keralaPool
    regionName = "Kerala Backwaters & Tea Hills"
  } else if (lowercaseText.includes('goa') || lowercaseText.includes('beach')) {
    pool = goaPool
    regionName = "Goa Beaches & Churches"
  } else if (lowercaseText.includes('ooty') || lowercaseText.includes('nilgiri')) {
    pool = ootyPool
    regionName = "Ooty Hill Station Retreat"
  } else if (lowercaseText.includes('kodaikanal') || lowercaseText.includes('kodai')) {
    pool = kodaiPool
    regionName = "Kodaikanal Mountain Escape"
  } else if (lowercaseText.includes('delhi') || lowercaseText.includes('agra') || lowercaseText.includes('taj') || lowercaseText.includes('triangle')) {
    pool = goldenTrianglePool
    regionName = "Classic Golden Triangle"
  }

  const targetStops = Math.max(3, duration * 3)

  // If we have a matching region, take stops from its pool
  if (pool.length > 0) {
    const waypoints: WaypointData[] = []
    for (let i = 0; i < targetStops; i++) {
      // Wrap around if duration requests more stops than pool contains
      const poolItem = pool[i % pool.length]
      waypoints.push({
        placeName: poolItem.placeName,
        order: i + 1,
        suggestedDurationMinutes: poolItem.suggestedDurationMinutes || (90 + (i * 30) % 120),
        localFoodSpots: poolItem.localFoodSpots,
        photoPoints: poolItem.photoPoints
      })
    }
    return {
      tripTitle: `${regionName} [${duration} Days • ${bTier} • ${group}]`,
      waypoints
    }
  }

  // 2. Dynamic Input Parsing Fallback
  // Remove technical prefixes appended during prompt generation
  const cleanInput = text
    .replace(/Destination details & ideas:\s*/i, '')
    .replace(/Trip duration:\s*\d+\s*days/i, '')
    .replace(/Selected budget style:\s*\w+/i, '')
    .replace(/Traveling companions:\s*\w+/i, '')
    .trim()

  let rawPlaces: string[] = []
  if (cleanInput.includes(',')) {
    rawPlaces = cleanInput.split(',').map(s => s.trim()).filter(s => s.length > 2)
  } else if (cleanInput.includes('\n')) {
    rawPlaces = cleanInput.split('\n').map(s => s.trim()).filter(s => s.length > 2)
  } else {
    rawPlaces = cleanInput
      .split(/(?:and|to|then|&|\+|-|•|\*)/i)
      .map(s => s.trim())
      .filter(s => s.length > 2)
  }

  // Sanitize places (restrict word length to avoid full paragraphs as titles)
  rawPlaces = rawPlaces.map(p => {
    const words = p.split(/\s+/)
    if (words.length > 6) {
      return words.slice(0, 5).join(' ')
    }
    return p
  }).filter(p => p.length > 0)

  // Title-casing helper
  const toTitleCase = (s: string) => s.replace(/\b\w/g, c => c.toUpperCase())

  if (rawPlaces.length === 0) {
    // If no places could be parsed, default to Delhi/Golden Triangle
    pool = goldenTrianglePool
    regionName = "Golden Triangle Discovery"
    const waypoints: WaypointData[] = []
    for (let i = 0; i < targetStops; i++) {
      const poolItem = pool[i % pool.length]
      waypoints.push({
        placeName: poolItem.placeName,
        order: i + 1,
        suggestedDurationMinutes: poolItem.suggestedDurationMinutes || 90,
        localFoodSpots: poolItem.localFoodSpots,
        photoPoints: poolItem.photoPoints
      })
    }
    return {
      tripTitle: `${regionName} [${duration} Days • ${bTier} • ${group}]`,
      waypoints
    }
  }

  // Expand the user's custom places to match the target stop count
  const waypoints: WaypointData[] = []
  const genericActivities = [
    "Heritage Walk",
    "Local Market & Spices Bazar",
    "Scenic Sunset Viewpoint",
    "Botanical Gardens",
    "Ancient Temple",
    "Craft Village",
    "Lakeside Promenade",
    "Art Museum",
    "Food Street Tour",
    "Old Town Gateway"
  ]

  for (let i = 0; i < targetStops; i++) {
    let placeName = ""
    if (i < rawPlaces.length) {
      placeName = toTitleCase(rawPlaces[i])
    } else {
      // Synthesize sub-locations by pairing user's input places with generic activities
      const basePlace = toTitleCase(rawPlaces[i % rawPlaces.length])
      const activity = genericActivities[(i - rawPlaces.length) % genericActivities.length]
      placeName = `${basePlace} ${activity}`
    }

    waypoints.push({
      placeName,
      order: i + 1,
      suggestedDurationMinutes: 90 + (i * 15) % 90,
      localFoodSpots: [
        `Famous ${placeName} Eatery`,
        `Local Dhaba at ${placeName}`
      ],
      photoPoints: [
        `Scenic landscape from ${placeName}`,
        `Vibrant local atmosphere at ${placeName}`
      ]
    })
  }

  const formattedTitle = toTitleCase(rawPlaces[0])
  return {
    tripTitle: `${formattedTitle} & Vicinity [${duration} Days • ${bTier} • ${group}]`,
    waypoints
  }
}

export async function parseItinerary(text: string, userId: string, userName: string, isPublic: boolean = true, coverUrl?: string): Promise<ParseItineraryResult> {
  if (!text || !text.trim()) {
    throw new Error('Travel itinerary description cannot be empty.')
  }
  if (!userId) {
    throw new Error('Authentication is required to generate a trip.')
  }

  // Parse out extra parameters if they were appended to the input text
  let duration = 5
  let budget = 'standard'
  let companions = 'solo'

  const durationMatch = text.match(/Trip duration:\s*(\d+)/i)
  if (durationMatch) duration = parseInt(durationMatch[1], 10)

  const budgetMatch = text.match(/Selected budget style:\s*(\w+)/i)
  if (budgetMatch) budget = budgetMatch[1]

  const companionsMatch = text.match(/Who is travelling\?|Traveling companions:\s*(\w+)/i)
  if (companionsMatch) companions = companionsMatch[1]

  // Extract clean description for prompt content
  const cleanInput = text
    .replace(/Destination details & ideas:\s*/i, '')
    .replace(/Trip duration:\s*\d+\s*days/i, '')
    .replace(/Selected budget style:\s*\w+/i, '')
    .replace(/Traveling companions:\s*\w+/i, '')
    .trim()

  const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_FIREBASE_API_KEY || ''
  const ai = new GoogleGenAI({ apiKey })

  let aiData: AIResponse | null = null
  let isMock = false
  let geminiErrorMsg = ''

  const targetMinStops = Math.max(3, duration * 3)

  const promptContents = `You are asked to generate a travel itinerary for a ${duration}-day trip.
The user's description and notes: "${cleanInput}"
Selected Budget Level: ${budget}
Companions: ${companions}

Analyze this input and generate a highly detailed, comprehensive day-by-day travel itinerary.
You MUST generate a rich and full itinerary containing at least ${targetMinStops} distinct stops (waypoints) distributed logically across the ${duration} days (approximately 3 to 4 stops per day). Do not group multiple locations into a single stop; list them as separate waypoints.`

  const promptConfig = {
    systemInstruction: `You are an expert Indian Tourism Optimizer. Analyze the user's travel text, duration, budget, and companion preferences, and structure it into a comprehensive day-by-day travel itinerary in India.

Key Requirements:
1. For the requested ${duration}-day trip, you MUST generate at least ${targetMinStops} distinct waypoints (stops) ordered sequentially (approx. 3-4 stops per day).
2. Every waypoint must strictly reside within or immediately near the requested destination city or region. Do NOT recommend places in different states or distant cities unless the user explicitly requested a multi-destination tour (e.g., 'Golden Triangle').
3. Crucial: To guarantee the geocoding APIs snap to the correct state, you MUST always append the city and state to the placeName (e.g., 'Hawa Mahal, Jaipur, Rajasthan' or 'Fort Aguada, Goa').
4. For each waypoint, estimate reasonable duration in minutes suited for standard Indian transport conditions (taking into account typical traffic congestion or winding mountain roads).
5. For each waypoint, provide exactly 2 iconic local food spots (street stalls, local dhabas, or famous regional restaurants) and 1 to 2 photogenic/scenic photo points.
6. Ensure the itinerary is logically organized and covers the most interesting attractions in the destination area.`,
    responseMimeType: 'application/json',
    responseSchema: {
      type: 'object',
      properties: {
        tripTitle: {
          type: 'string',
          description: `A catchy, descriptive title for this journey (e.g. "Vibrant Rajasthan Discovery" or "Classic Golden Triangle Adventure"). Include budget and companion context.`
        },
        waypoints: {
          type: 'array',
          description: `A list of sequential waypoints representing the stops of the itinerary. Since this is a ${duration}-day trip, this list MUST contain at least ${targetMinStops} distinct stops.`,
          items: {
            type: 'object',
            properties: {
              placeName: { 
                type: 'string', 
                description: 'Name of the place or monument in India, always appended with the target city and state (e.g., "Lotus Temple, Delhi").' 
              },
              order: { type: 'integer', description: 'The sequential order of this stop (starting at 1).' },
              suggestedDurationMinutes: { type: 'integer', description: 'Reasonable estimated time to spend at this stop (minimum 30).' },
              localFoodSpots: {
                type: 'array',
                items: { type: 'string' },
                description: 'Exactly 2 iconic local food spots, stalls, or local dhabas.'
              },
              photoPoints: {
                type: 'array',
                items: { type: 'string' },
                description: '1 to 2 visually striking scenic or photogenic spots.'
              }
            },
            required: ['placeName', 'order', 'suggestedDurationMinutes', 'localFoodSpots', 'photoPoints']
          }
        }
      },
      required: ['tripTitle', 'waypoints']
    }
  }

  try {
    // 1. Call Gemini to parse and optimize the unstructured text (try gemini-2.5-flash first)
    let response
    try {
      response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: promptContents,
        config: promptConfig
      })
    } catch (firstErr) {
      const firstErrMsg = firstErr instanceof Error ? firstErr.message : String(firstErr)
      console.warn('⚠️ Primary model gemini-2.5-flash failed, attempting fallback model gemini-1.5-flash...', firstErrMsg)
      response = await ai.models.generateContent({
        model: 'gemini-1.5-flash',
        contents: promptContents,
        config: promptConfig
      })
    }

    if (response && response.text) {
      aiData = JSON.parse(response.text) as AIResponse
    }
  } catch (err) {
    geminiErrorMsg = err instanceof Error ? err.message : String(err)
    console.warn('⚠️ Gemini API call failed. Falling back to high-fidelity offline mock mode.', geminiErrorMsg)
    aiData = generateMockItinerary(text, duration, budget, companions)
    isMock = true
  }

  // Safe fallback if JSON parsing failed or object is empty
  if (!aiData || !aiData.tripTitle || !Array.isArray(aiData.waypoints) || aiData.waypoints.length === 0) {
    geminiErrorMsg = geminiErrorMsg || 'Invalid or empty response format received from Gemini API.'
    console.warn('⚠️ Fallback to mock itinerary due to invalid AI response.')
    aiData = generateMockItinerary(text, duration, budget, companions)
    isMock = true
  }

  try {
    // 2. Persist the main Trip document in Firestore
    const tripRef = await addDoc(collection(db, 'trips'), {
      userId,
      userName,
      title: aiData.tripTitle,
      isPublic,
      sourceText: text,
      createdAt: new Date().toISOString(),
      isMock,
      coverUrl: coverUrl || null,
      geminiError: geminiErrorMsg || null
    })

    const resultWaypoints: Waypoint[] = []

    // 3. Persist the sub-collection Waypoint documents sequentially
    for (const wp of aiData.waypoints) {
      const waypointRef = doc(collection(db, 'trips', tripRef.id, 'waypoints'))
      const waypointData: Waypoint = {
        id: waypointRef.id,
        placeName: wp.placeName,
        order: wp.order,
        durationMin: wp.suggestedDurationMinutes,
        foodSpots: wp.localFoodSpots || [],
        photoPoints: wp.photoPoints || [],
        lat: 0,
        lng: 0
      }
      await setDoc(waypointRef, waypointData)
      resultWaypoints.push(waypointData)
    }

    const tripData: Trip = {
      id: tripRef.id,
      userId,
      userName,
      title: aiData.tripTitle,
      isPublic,
      sourceText: text,
      createdAt: new Date().toISOString(),
      isMock,
      coverUrl,
      geminiError: geminiErrorMsg || undefined
    }

    return {
      tripId: tripRef.id,
      success: true,
      trip: tripData,
      waypoints: resultWaypoints,
      isMock,
      isLocalFallback: false,
      geminiError: geminiErrorMsg || undefined
    }

  } catch (dbErr) {
    const dbErrMsg = dbErr instanceof Error ? dbErr.message : String(dbErr)
    console.warn('⚠️ Cloud Firestore write failed, falling back to local mode:', dbErrMsg)
    
    const fallbackId = 'local-trip-' + Date.now()
    
    const tripData: Trip = {
      id: fallbackId,
      userId,
      userName,
      title: aiData.tripTitle,
      isPublic,
      sourceText: text,
      createdAt: new Date().toISOString(),
      isMock,
      coverUrl,
      geminiError: geminiErrorMsg || undefined
    }

    const resultWaypoints: Waypoint[] = aiData.waypoints.map((wp, index) => ({
      id: `local-wp-${fallbackId}-${index}`,
      placeName: wp.placeName,
      order: wp.order,
      durationMin: wp.suggestedDurationMinutes,
      foodSpots: wp.localFoodSpots || [],
      photoPoints: wp.photoPoints || [],
      lat: 0,
      lng: 0
    }))

    return {
      tripId: fallbackId,
      success: false,
      trip: tripData,
      waypoints: resultWaypoints,
      isMock,
      isLocalFallback: true,
      geminiError: geminiErrorMsg || undefined
    }
  }
}
