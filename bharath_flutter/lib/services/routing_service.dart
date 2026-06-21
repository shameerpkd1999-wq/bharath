import 'dart:convert';
import 'package:http/http.dart' as http;
import '../models/route_step.dart';
import '../models/waypoint.dart';

class RoutingService {
  // Nominatim Autocomplete Suggestions
  Future<List<Map<String, dynamic>>> getPlaceSuggestions(String query) async {
    try {
      final encodedQuery = Uri.encodeComponent(query);
      final url = 'https://nominatim.openstreetmap.org/search?q=$encodedQuery&format=json&limit=5&addressdetails=1&countrycodes=in';
      
      final response = await http.get(
        Uri.parse(url),
        headers: {'User-Agent': 'BharatYatraMobile/1.0 (com.bharatyatra.app)'},
      );

      if (response.statusCode == 200) {
        final List<dynamic> data = jsonDecode(response.body);
        return data.map((item) {
          return {
            'display_name': item['display_name'] ?? '',
            'lat': double.parse(item['lat']),
            'lon': double.parse(item['lon']),
          };
        }).toList();
      }
      return [];
    } catch (e) {
      print('Geocoding suggestions error: $e');
      return [];
    }
  }

  // Geocode a single place name to coordinates
  Future<Map<String, double>?> geocodePlace(String placeName) async {
    try {
      final results = await getPlaceSuggestions(placeName);
      if (results.isNotEmpty) {
        return {
          'lat': results[0]['lat'],
          'lng': results[0]['lon'],
        };
      }
      return null;
    } catch (e) {
      print('Single geocode error: $e');
      return null;
    }
  }

  // Fetch OSRM Road Route between waypoints
  Future<Map<String, dynamic>?> fetchRoute({
    required List<Waypoint> waypoints,
    required String travelMode,
    Map<String, double>? userLocation,
    bool startTrip = false,
  }) async {
    List<Waypoint> validWaypoints = waypoints.where((wp) => wp.lat != 0.0 && wp.lng != 0.0).toList();

    // If navigation is active and we have user coordinates, prepend current position
    if (startTrip && userLocation != null) {
      validWaypoints.insert(
        0,
        Waypoint(
          id: 'current-loc',
          placeName: 'Your Location',
          order: 0,
          durationMin: 0,
          foodSpots: [],
          photoPoints: [],
          lat: userLocation['lat']!,
          lng: userLocation['lng']!,
        ),
      );
    }

    if (validWaypoints.length < 2) return null;

    final profile = travelMode == 'walking' ? 'foot' : 'driving';
    final coordsQuery = validWaypoints.map((wp) => '${wp.lng},${wp.lat}').join(';');
    final url = 'https://router.project-osrm.org/route/v1/$profile/$coordsQuery?overview=full&geometries=geojson&steps=true';

    try {
      final response = await http.get(Uri.parse(url));

      if (response.statusCode == 200) {
        final Map<String, dynamic> data = jsonDecode(response.body);
        if (data['code'] == 'Ok' && data['routes'] != null && (data['routes'] as List).isNotEmpty) {
          final route = data['routes'][0];
          
          // Parse coordinates geometry list
          final geometry = route['geometry']['coordinates'] as List<dynamic>;
          final List<Map<String, double>> polylinePoints = geometry.map((coord) {
            return {
              'lat': (coord[1] as num).toDouble(),
              'lng': (coord[0] as num).toDouble(),
            };
          }).toList();

          // Calculate metrics
          final double distanceKm = (route['distance'] as num).toDouble() / 1000.0;
          
          // Walking speed override for OSRM limits
          final double durationMin = travelMode == 'walking'
              ? (distanceKm / 5.0) * 60.0
              : (route['duration'] as num).toDouble() / 60.0;

          // Parse navigation steps
          List<RouteStep> steps = [];
          if (route['legs'] != null && route['legs'] is List) {
            for (var leg in route['legs']) {
              if (leg['steps'] != null && leg['steps'] is List) {
                for (var step in leg['steps']) {
                  steps.add(RouteStep(
                    instruction: step['maneuver']['instruction'] ?? _getStepInstruction(step),
                    distanceMeters: (step['distance'] as num).toDouble(),
                    durationSeconds: (step['duration'] as num).toDouble(),
                    type: step['maneuver']['type'] ?? '',
                    modifier: step['maneuver']['modifier'],
                  ));
                }
              }
            }
          }

          return {
            'polyline': polylinePoints,
            'distanceKm': distanceKm,
            'durationMin': durationMin,
            'steps': steps,
          };
        }
      }
    } catch (e) {
      print('Fetch route network error: $e');
    }

    // Fallback: simple straight-line routing connecting waypoints
    final List<Map<String, double>> straightPoints = validWaypoints
        .map((w) => {'lat': w.lat, 'lng': w.lng})
        .toList();

    return {
      'polyline': straightPoints,
      'distanceKm': 0.0,
      'durationMin': 0.0,
      'steps': <RouteStep>[],
    };
  }

  // Helper mapping turns fallback instructions
  String _getStepInstruction(Map<String, dynamic> step) {
    final maneuver = step['maneuver'] ?? {};
    final type = maneuver['type'] ?? '';
    final modifier = maneuver['modifier'] ?? '';
    final street = (step['name'] as String?)?.isNotEmpty == true ? step['name'] : 'road';

    if (type == 'depart') return 'Head $modifier on $street';
    if (type == 'arrive') return 'Arrive at destination';
    if (type == 'merge') return 'Merge onto $street';
    if (type == 'fork') return 'Take the fork $modifier onto $street';
    if (type == 'off ramp') return 'Take the exit ramp onto $street';
    if (type == 'on ramp') return 'Take the entrance ramp onto $street';

    if (type == 'turn') {
      if (modifier == 'straight') return 'Go straight onto $street';
      if (modifier == 'slight left') return 'Slight left onto $street';
      if (modifier == 'slight right') return 'Slight right onto $street';
      if (modifier == 'sharp left') return 'Sharp left onto $street';
      if (modifier == 'sharp right') return 'Sharp right onto $street';
      if (modifier == 'left') return 'Turn left onto $street';
      if (modifier == 'right') return 'Turn right onto $street';
      if (modifier == 'uturn') return 'Make a U-turn onto $street';
      return 'Turn $modifier onto $street';
    }

    if (type == 'roundabout') {
      return 'Enter the roundabout and take exit onto $street';
    }

    return 'Continue onto $street';
  }
}
