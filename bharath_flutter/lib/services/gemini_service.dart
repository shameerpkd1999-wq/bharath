import 'dart:convert';
import 'package:google_generative_ai/google_generative_ai.dart';
import '../models/trip.dart';
import '../models/waypoint.dart';

class GeminiService {
  final String apiKey;

  GeminiService({required this.apiKey});

  // Main generator method
  Future<Map<String, dynamic>> generateItinerary({
    required String text,
    required int duration,
    required String budget,
    required String companions,
    required String userId,
    required String userName,
    String? coverUrl,
  }) async {
    String geminiErrorMsg = '';
    bool isMock = false;
    String tripTitle = '';
    List<Waypoint> waypoints = [];

    if (apiKey.isEmpty) {
      isMock = true;
      geminiErrorMsg = 'Gemini API Key is empty. Switched to offline mock mode.';
    } else {
      try {
        final model = GenerativeModel(
          model: 'gemini-2.5-flash',
          apiKey: apiKey,
          systemInstruction: Content.system('''
You are an expert Indian travel planner. Generate a highly detailed, realistic, geographic-optimized itinerary in JSON format.
You must return a JSON object with:
{
  "tripTitle": "A catchy title describing the trip",
  "waypoints": [
    {
      "day": 1,
      "name": "Tea Museum",
      "city": "Munnar",
      "district": "Idukki",
      "state": "Kerala",
      "type": "museum",
      "order": 1,
      "suggestedDurationMinutes": 120,
      "localFoodSpots": ["Food Spot 1", "Food Spot 2"],
      "photoPoints": ["Scenic point 1", "Scenic point 2"]
    }
  ]
}
Geographic Rules:
1. Every stop's placeName must strictly reside within or immediately near the requested destination region (e.g., if requested 'Jaipur', all stops must be in Jaipur. Do not include Agra, Delhi, or places in other states unless the user explicitly requested a multi-state tour).
2. To prevent search geocoding overlap or snapping to other states, you MUST always append the city and state to the placeName (e.g., 'Lotus Temple, Delhi' or 'Baga Beach, Goa').
Ensure waypoints are ordered logically for minimum travel time.
'''),
          generationConfig: GenerationConfig(
            responseMimeType: 'application/json',
          ),
        );

        final prompt = 'Plan a trip to "$text" for $duration days. Budget level: $budget. Companions: $companions.';
        
        final response = await model.generateContent([
          Content.text(prompt),
        ]);

        if (response.text != null && response.text!.isNotEmpty) {
          String responseText = response.text!.trim();
          if (responseText.startsWith('```')) {
            // Remove markdown code blocks if present
            responseText = responseText.replaceAll(RegExp(r'^```(json)?'), '');
            responseText = responseText.replaceAll(RegExp(r'```$'), '');
            responseText = responseText.trim();
          }

          final decoded = jsonDecode(responseText) as Map<String, dynamic>;
          tripTitle = decoded['tripTitle'] ?? 'India Exploration';
          var wpsData = decoded['waypoints'] as List<dynamic>? ?? [];
          
          for (int i = 0; i < wpsData.length; i++) {
            var wpMap = wpsData[i] as Map<String, dynamic>;
            
            // Combine name, city, state for better geocoding results
            final name = wpMap['name'] ?? 'Attraction';
            final city = wpMap['city'] ?? '';
            final state = wpMap['state'] ?? '';
            final placeName = [name, city, state].where((s) => s.isNotEmpty).join(' ');

            waypoints.add(Waypoint(
              id: 'wp-${DateTime.now().millisecondsSinceEpoch}-$i',
              placeName: placeName,
              order: wpMap['order'] ?? (i + 1),
              durationMin: wpMap['suggestedDurationMinutes'] ?? 90,
              foodSpots: List<String>.from(wpMap['localFoodSpots'] ?? []),
              photoPoints: List<String>.from(wpMap['photoPoints'] ?? []),
              lat: 0.0, // Will be geocoded by client/routing service
              lng: 0.0,
              day: wpMap['day'] ?? 1,
            ));
          }
        } else {
          throw Exception('Empty response from Gemini API');
        }
      } catch (e) {
        geminiErrorMsg = e.toString();
        isMock = true;
      }
    }

    // Fallback to Offline Mock if Gemini failed or is unavailable
    if (isMock || waypoints.isEmpty) {
      final mockData = _generateMockItinerary(text, duration, budget, companions);
      tripTitle = mockData['tripTitle'];
      waypoints = mockData['waypoints'];
    }

    final newTrip = Trip(
      id: 'trip-${DateTime.now().millisecondsSinceEpoch}',
      userId: userId,
      userName: userName,
      title: tripTitle,
      isPublic: false,
      sourceText: text,
      createdAt: DateTime.now().toIso8601String(),
      coverUrl: coverUrl,
      isMock: isMock,
      geminiError: geminiErrorMsg.isNotEmpty ? geminiErrorMsg : null,
      waypoints: waypoints,
    );

    return {
      'trip': newTrip,
      'waypoints': waypoints,
      'isMock': isMock,
    };
  }

  // Offline mock generator helper
  Map<String, dynamic> _generateMockItinerary(String text, int duration, String budget, String companions) {
    final query = text.toLowerCase();
    String regionName = 'Indian Discovery';
    List<Map<String, dynamic>> pool = _defaultPool;

    if (query.contains('jaipur') || query.contains('rajasthan')) {
      pool = _jaipurPool;
      regionName = 'Jaipur & Rajasthan Heritage';
    } else if (query.contains('kerala') || query.contains('alleppey') || query.contains('munnar')) {
      pool = _keralaPool;
      regionName = 'Kerala Backwaters & Tea Hills';
    } else if (query.contains('goa') || query.contains('beach')) {
      pool = _goaPool;
      regionName = 'Goa Beaches & Churches';
    } else if (query.contains('delhi') || query.contains('agra') || query.contains('taj')) {
      pool = _goldenTrianglePool;
      regionName = 'Classic Golden Triangle';
    }

    final int targetStops = (duration * 3).clamp(3, 12);
    List<Waypoint> waypoints = [];

    // Calculate roughly how many stops per day
    final int stopsPerDay = (targetStops / duration).ceil();

    for (int i = 0; i < targetStops; i++) {
      final item = pool[i % pool.length];
      final currentDay = (i ~/ stopsPerDay) + 1;
      
      waypoints.add(Waypoint(
        id: 'mock-wp-$i-${DateTime.now().millisecondsSinceEpoch}',
        placeName: item['placeName'],
        order: i + 1,
        durationMin: item['suggestedDurationMinutes'] ?? 90,
        foodSpots: List<String>.from(item['localFoodSpots'] ?? []),
        photoPoints: List<String>.from(item['photoPoints'] ?? []),
        lat: 0.0,
        lng: 0.0,
        day: currentDay > duration ? duration : currentDay,
      ));
    }

    return {
      'tripTitle': '$regionName [$duration Days • ${budget.toUpperCase()} • $companions]',
      'waypoints': waypoints,
    };
  }

  // Sample Mock Pools
  static final List<Map<String, dynamic>> _jaipurPool = [
    {
      'placeName': 'Hawa Mahal (Palace of Winds)',
      'suggestedDurationMinutes': 60,
      'localFoodSpots': ['Laxmi Mishthan Bhandar (LMB)', 'Wind View Cafe'],
      'photoPoints': ['Hawa Mahal facade from street level']
    },
    {
      'placeName': 'Amer Fort & Palace',
      'suggestedDurationMinutes': 180,
      'localFoodSpots': ['1135 AD Fort Restaurant', 'Amer Kulfi Stall'],
      'photoPoints': ['Sheesh Mahal reflections', 'Maota Lake viewpoint']
    },
    {
      'placeName': 'City Palace Jaipur',
      'suggestedDurationMinutes': 120,
      'localFoodSpots': ['The Baradari Restaurant'],
      'photoPoints': ['Peacock Gate courtyards']
    },
  ];

  static final List<Map<String, dynamic>> _keralaPool = [
    {
      'placeName': 'Alleppey Backwaters Houseboat',
      'suggestedDurationMinutes': 240,
      'localFoodSpots': ['Karimeen Pollichathu Local Stall', 'Houseboat Kitchen'],
      'photoPoints': ['Sunset over Vembanad Lake', 'Canal coconut trees']
    },
    {
      'placeName': 'Munnar Tea Gardens',
      'suggestedDurationMinutes': 120,
      'localFoodSpots': ['Rapsy Restaurant', 'Tea Museum Chai'],
      'photoPoints': ['Lush green tea estate rolls']
    },
  ];

  static final List<Map<String, dynamic>> _goaPool = [
    {
      'placeName': 'Baga Beach',
      'suggestedDurationMinutes': 150,
      'localFoodSpots': ['Britto\'s Shack', 'Tito\'s Club Food'],
      'photoPoints': ['Baga sunset beach lines']
    },
    {
      'placeName': 'Basilica of Bom Jesus',
      'suggestedDurationMinutes': 90,
      'localFoodSpots': ['Old Goa Cafeteria'],
      'photoPoints': ['St. Francis casket', 'Old baroque facade']
    },
  ];

  static final List<Map<String, dynamic>> _goldenTrianglePool = [
    {
      'placeName': 'Taj Mahal, Agra',
      'suggestedDurationMinutes': 180,
      'localFoodSpots': ['Pinch of Spice', 'Taj Bano'],
      'photoPoints': ['Classic reflection pool photo', 'Yamuna River view']
    },
    {
      'placeName': 'Agra Fort',
      'suggestedDurationMinutes': 120,
      'localFoodSpots': ['Mama Chicken Mama Franky', 'Agra Chat Corner'],
      'photoPoints': ['Jahangir Palace architecture', 'Taj view from octagonal tower']
    },
    {
      'placeName': 'Qutub Minar, Delhi',
      'suggestedDurationMinutes': 90,
      'localFoodSpots': ['Kake Di Hatti', 'Qutub Cafe'],
      'photoPoints': ['Tower towering view', 'Alai Darwaza arches']
    },
  ];

  static final List<Map<String, dynamic>> _defaultPool = _goldenTrianglePool;
}
