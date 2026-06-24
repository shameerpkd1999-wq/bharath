import 'dart:convert';
import 'dart:math';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import '../models/route_step.dart';
import '../models/waypoint.dart';

class RoutingService {
  static const String _mapplKey = String.fromEnvironment(
    'MAPPLS_SDK_KEY',
    defaultValue: 'aaboszsxkdezjefndyureyrkalhergfwcqot',
  );

  static const String _mapplsClientId = String.fromEnvironment('MAPPLS_CLIENT_ID', defaultValue: '');
  static const String _mapplsClientSecret = String.fromEnvironment('MAPPLS_CLIENT_SECRET', defaultValue: '');

  String? _cachedOAuthToken;
  DateTime? _tokenExpiry;

  // Fetch OAuth Token for Mappls API (Atlas APIs)
  Future<String?> _getMapplsOAuthToken() async {
    if (_mapplsClientId.isEmpty || _mapplsClientSecret.isEmpty) return null;
    
    if (_cachedOAuthToken != null && _tokenExpiry != null && DateTime.now().isBefore(_tokenExpiry!)) {
      return _cachedOAuthToken;
    }

    try {
      final response = await http.post(
        Uri.parse('https://outpost.mapmyindia.com/api/sso/oauth/token'),
        headers: {'Content-Type': 'application/x-www-form-urlencoded'},
        body: {
          'grant_type': 'client_credentials',
          'client_id': _mapplsClientId,
          'client_secret': _mapplsClientSecret,
        },
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        _cachedOAuthToken = data['access_token'];
        // Token usually expires in 86399 seconds (24h), we'll set it to 23 hours to be safe
        final int expiresIn = data['expires_in'] ?? 82800;
        _tokenExpiry = DateTime.now().add(Duration(seconds: expiresIn - 600));
        return _cachedOAuthToken;
      } else {
        debugPrint('Mappls OAuth Error: ${response.body}');
      }
    } catch (e) {
      debugPrint('Mappls OAuth Exception: $e');
    }
    return null;
  }

  // Mappls Autosuggest Search
  Future<List<Map<String, dynamic>>> searchMapplsAutosuggest(String query) async {
    final token = await _getMapplsOAuthToken();
    if (token == null) return [];

    try {
      final encodedQuery = Uri.encodeComponent(query);
      // We use Atlas search API for best relevance
      final url = 'https://atlas.mappls.com/api/places/search/json?query=$encodedQuery&region=IND';
      
      final response = await http.get(
        Uri.parse(url),
        headers: {
          'Authorization': 'bearer $token',
        },
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        final List<dynamic> places = data['suggestedLocations'] ?? [];
        return places.map((item) {
          return {
            'display_name': item['placeName'] ?? item['placeAddress'] ?? '',
            'mapplsPin': item['eLoc'],
            'lat': item['latitude'] is num ? (item['latitude'] as num).toDouble() : double.tryParse(item['latitude']?.toString() ?? ''),
            'lng': item['longitude'] is num ? (item['longitude'] as num).toDouble() : double.tryParse(item['longitude']?.toString() ?? ''),
          };
        }).toList();
      } else {
        debugPrint('Mappls Search Error: ${response.body}');
      }
    } catch (e) {
      debugPrint('Mappls Search Exception: $e');
    }
    return [];
  }

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
      debugPrint('Geocoding suggestions error: $e');
      return [];
    }
  }

  // Hybrid Autocomplete Suggestions (Mappls -> Nominatim)
  Future<List<Map<String, dynamic>>> getHybridSuggestions(String query) async {
    final mapplsResults = await searchMapplsAutosuggest(query);
    if (mapplsResults.isNotEmpty) {
      return mapplsResults;
    }
    return getPlaceSuggestions(query);
  }

  // Clean travel verbs, prefixes, and parentheticals from place name to optimize geocoding
  String cleanPlaceName(String name) {
    String clean = name;
    
    // 1. Remove parenthetical info like "(Palace of Winds)" or "[Recommended]"
    clean = clean.replaceAll(RegExp(r'\([^)]*\)'), '');
    clean = clean.replaceAll(RegExp(r'\[[^\]]*\]'), '');
    
    // 2. Remove common prefixes (case-insensitive)
    // Matching: "Day 1:", "Day 1 -", "Visit ", "Explore ", "Arrival at ", "Check-in at ", etc.
    final prefixReg = RegExp(
      r'^(day\s*\d+\s*[:\-–—]?|visit|explore|enjoy|stop\s*\d+\s*[:\-–—]?|arrival\s+at|check-in\s+at|check\s+in\s+at|lunch\s+at|dinner\s+at|breakfast\s+at|stay\s+at)\s+',
      caseSensitive: false,
    );
    clean = clean.replaceAll(prefixReg, '');

    // 3. Remove clean-up residue like extra spaces or double commas
    clean = clean.replaceAll(RegExp(r'\s+'), ' ').replaceAll(RegExp(r'\s*,\s*,\s*'), ', ').trim();
    
    // If it starts or ends with a comma, clean it
    if (clean.startsWith(',')) {
      clean = clean.substring(1).trim();
    }
    if (clean.endsWith(',')) {
      clean = clean.substring(0, clean.length - 1).trim();
    }
    
    return clean.isEmpty ? name : clean;
  }

  // Geocode a single place name to coordinates with progressive fallbacks
  Future<Map<String, dynamic>?> geocodePlace(String placeName) async {
    try {
      final cleanName = cleanPlaceName(placeName);
      
      // 1. Try Mappls Autosuggest first (Highly Accurate)
      final mapplsResults = await searchMapplsAutosuggest(cleanName);
      if (mapplsResults.isNotEmpty && mapplsResults[0]['lat'] != null && mapplsResults[0]['lng'] != null) {
        return {
          'lat': mapplsResults[0]['lat'],
          'lng': mapplsResults[0]['lng'],
          'mapplsPin': mapplsResults[0]['mapplsPin'],
        };
      }

      // 2. Fallback to OpenStreetMap/Nominatim
      var results = await getPlaceSuggestions(cleanName);
      if (results.isNotEmpty) {
        return {
          'lat': results[0]['lat'],
          'lng': results[0]['lon'],
          'mapplsPin': null,
        };
      }

      // If it fails and there are commas, try split-based progressive search
      if (cleanName.contains(',')) {
        final parts = cleanName.split(',').map((p) => p.trim()).where((p) => p.isNotEmpty).toList();
        
        if (parts.length > 2) {
          // Try first part and second part
          final query1 = '${parts[0]}, ${parts[1]}';
          results = await getPlaceSuggestions(query1);
          if (results.isNotEmpty) {
            return {
              'lat': results[0]['lat'],
              'lng': results[0]['lon'],
              'mapplsPin': null,
            };
          }

          // Try first part and last part
          final query2 = '${parts[0]}, ${parts.last}';
          results = await getPlaceSuggestions(query2);
          if (results.isNotEmpty) {
            return {
              'lat': results[0]['lat'],
              'lng': results[0]['lon'],
              'mapplsPin': null,
            };
          }
        }

        // Try just the first part
        if (parts.isNotEmpty) {
          results = await getPlaceSuggestions(parts[0]);
          if (results.isNotEmpty) {
            return {
              'lat': results[0]['lat'],
              'lng': results[0]['lon'],
              'mapplsPin': null,
            };
          }
        }
      }

      return null;
    } catch (e) {
      debugPrint('Single geocode error: $e');
      return null;
    }
  }

  // Adjust duplicate coordinates to prevent overlapping markers on the map
  List<Waypoint> adjustDuplicateCoordinates(List<Waypoint> waypoints) {
    final List<Waypoint> adjusted = [];
    
    for (int i = 0; i < waypoints.length; i++) {
      final wp = waypoints[i];
      if (wp.lat == 0.0 && wp.lng == 0.0) {
        adjusted.add(wp);
        continue;
      }
      
      int duplicateCount = 0;
      for (int j = 0; j < adjusted.length; j++) {
        final double latDiff = (wp.lat - adjusted[j].lat).abs();
        final double lngDiff = (wp.lng - adjusted[j].lng).abs();
        if (latDiff < 0.0001 && lngDiff < 0.0001) {
          duplicateCount++;
        }
      }
      
      if (duplicateCount > 0) {
        // Offset the coordinates spiraling outward to make them distinct on map
        // 0.00035 degrees is approx 35 meters
        final double angle = duplicateCount * 0.785; // ~45 degrees spiral step
        final double distance = 0.00035 * duplicateCount;
        final double offsetLat = distance * sin(angle);
        final double offsetLng = distance * cos(angle);
        
        adjusted.add(wp.copyWith(
          lat: wp.lat + offsetLat,
          lng: wp.lng + offsetLng,
        ));
      } else {
        adjusted.add(wp);
      }
    }
    return adjusted;
  }

  // Reverse geocode lat/lng to display name
  Future<String> reverseGeocode(double lat, double lng) async {
    try {
      final url = 'https://nominatim.openstreetmap.org/reverse?format=json&lat=$lat&lon=$lng';
      final response = await http.get(
        Uri.parse(url),
        headers: {'User-Agent': 'BharatYatraMobile/1.0 (com.bharatyatra.app)'},
      );
      if (response.statusCode == 200) {
        final Map<String, dynamic> data = jsonDecode(response.body);
        if (data.containsKey('display_name')) {
          return data['display_name'] ?? '';
        }
      }
    } catch (e) {
      debugPrint('Reverse geocoding error: $e');
    }
    return 'Location (${lat.toStringAsFixed(4)}, ${lng.toStringAsFixed(4)})';
  }

  String _decodeHex(String hex) {
    try {
      final List<int> bytes = [];
      for (int i = 0; i < hex.length; i += 2) {
        bytes.add(int.parse(hex.substring(i, i + 2), radix: 16));
      }
      return ascii.decode(bytes);
    } catch (_) {
      return '';
    }
  }

  // Fetch place details from Mappls eLoc Pin
  Future<Map<String, dynamic>?> fetchPlaceFromPin(String pin) async {
    // 1. Try Keyless HTML Scraper first (robust and key-independent)
    try {
      final String url = 'https://mappls.com/$pin';
      final response = await http.get(
        Uri.parse(url),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
      );
      if (response.statusCode == 200) {
        final body = response.body;

        // Extract place name
        final ogTitleReg = RegExp(r'<meta property="og:title" content="([^"]+)">');
        String placeName = ogTitleReg.firstMatch(body)?.group(1) ?? '';

        // Extract address
        final ogDescReg = RegExp(r'<meta property="og:description" content="([^"]+)">');
        String address = ogDescReg.firstMatch(body)?.group(1) ?? '';

        if (placeName.isEmpty) {
          final titleReg = RegExp(r'<title>([^<]+)</title>');
          final title = titleReg.firstMatch(body)?.group(1) ?? '';
          if (title.isNotEmpty) {
            final parts = title.split(',');
            placeName = parts[0].trim();
            address = parts.skip(1).join(',').trim();
          }
        }

        // Extract coordinates
        double? lat;
        double? lng;

        // Fallback A: addEditPlace(10.778867,76.473592,...)
        final RegExp editReg = RegExp(r'addEditPlace\(\s*(\d+\.\d+)\s*,\s*(\d+\.\d+)\s*,');
        final editMatch = editReg.firstMatch(body);
        if (editMatch != null) {
          lat = double.tryParse(editMatch.group(1)!);
          lng = double.tryParse(editMatch.group(2)!);
        }

        // Fallback B: Decoded still_image hex coordinates
        if (lat == null || lng == null) {
          final RegExp imgReg = RegExp(r'still_image_([a-zA-Z0-9_]+)\.png');
          final imgMatch = imgReg.firstMatch(body);
          if (imgMatch != null) {
            final parts = imgMatch.group(1)!.split('_');
            if (parts.length >= 2) {
              final latStr = _decodeHex(parts[0]);
              final lngStr = _decodeHex(parts[1]);
              lat = double.tryParse(latStr);
              lng = double.tryParse(lngStr);
            }
          }
        }

        // Fallback C: Any general coordinate pattern in script/tags
        if (lat == null || lng == null) {
          final RegExp genericReg = RegExp(r'(\d+\.\d+),(\d+\.\d+)');
          final genericMatch = genericReg.firstMatch(body);
          if (genericMatch != null) {
            lat = double.tryParse(genericMatch.group(1)!);
            lng = double.tryParse(genericMatch.group(2)!);
          }
        }

        if (lat != null && lng != null) {
          return {
            'placeName': placeName.isNotEmpty ? placeName : 'Mappls Pin Location',
            'address': address,
            'lat': lat,
            'lng': lng,
          };
        }
      }
    } catch (e) {
      debugPrint('Keyless resolution failed, falling back to API: $e');
    }

    // 2. Fallback to API if keyless failed and we have a key
    if (_mapplKey.isEmpty) return null;
    final urls = [
      'https://apis.mappls.com/advancedmaps/v1/$_mapplKey/place_detail?place_id=$pin',
      'https://apis.mapmyindia.com/advancedmaps/v1/$_mapplKey/place_detail?place_id=$pin',
    ];

    for (final url in urls) {
      try {
        final response = await http.get(Uri.parse(url));
        if (response.statusCode == 200) {
          final Map<String, dynamic> data = jsonDecode(response.body);
          if (data['results'] != null && (data['results'] as List).isNotEmpty) {
            final result = data['results'][0];
            final String placeName = result['placeName'] ?? result['name'] ?? '';
            final String address = result['formatted_address'] ?? result['address'] ?? '';
            final double? lat = result['latitude'] != null ? double.tryParse(result['latitude'].toString()) : null;
            final double? lng = result['longitude'] != null ? double.tryParse(result['longitude'].toString()) : null;
            
            if (lat != null && lng != null) {
              return {
                'placeName': placeName.isNotEmpty ? placeName : (address.isNotEmpty ? address.split(',')[0] : 'Mappls Pin Location'),
                'address': address,
                'lat': lat,
                'lng': lng,
              };
            }
          }
        }
      } catch (e) {
        debugPrint('Fetch place from Pin API error for $url: $e');
      }
    }
    return null;
  }

  // Resolve coordinates with landmark & city center fallback logic
  Future<Map<String, dynamic>> resolveCoordinates(String placeName, String contextText) async {
    // 1. Try normal geocoding first
    final coords = await geocodePlace(placeName);
    if (coords != null && coords['lat'] != 0.0 && coords['lng'] != 0.0) {
      return coords;
    }

    final normalizedName = placeName.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]'), '');
    final normalizedContext = contextText.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]'), '');

    // Specific landmark coordinates (to bypass search overlaps)
    final Map<String, Map<String, dynamic>> specificPlaces = {
      'tajmahal': {'lat': 27.1751, 'lng': 78.0421},
      'redfort': {'lat': 28.6562, 'lng': 77.2410},
      'qutubminar': {'lat': 28.5245, 'lng': 77.1855},
      'indiagate': {'lat': 28.6129, 'lng': 77.2295},
      'lotustemple': {'lat': 28.5535, 'lng': 77.2588},
      'chandnichowk': {'lat': 28.6506, 'lng': 77.2303},
      'agrafort': {'lat': 27.1795, 'lng': 78.0211},
      'hawamahal': {'lat': 26.9239, 'lng': 75.8267},
      'amerfort': {'lat': 26.9855, 'lng': 75.8513},
      'amberfort': {'lat': 26.9855, 'lng': 75.8513},
      'citypalace': {'lat': 26.9258, 'lng': 75.8237},
      'jantarmantar': {'lat': 26.9248, 'lng': 75.8245},
      'jalmahal': {'lat': 26.9534, 'lng': 75.8462},
      'alleppeyhouseboat': {'lat': 9.4981, 'lng': 76.3388},
      'vembanad': {'lat': 9.5981, 'lng': 76.3533},
      'munnartea': {'lat': 10.0889, 'lng': 77.0595},
      'lockhart': {'lat': 10.0450, 'lng': 77.1630},
      'mattupetty': {'lat': 10.1060, 'lng': 77.1245},
      'bomjesus': {'lat': 15.5009, 'lng': 73.9116},
      'bagabeach': {'lat': 15.5539, 'lng': 73.7551},
      'calangute': {'lat': 15.5442, 'lng': 73.7624},
      'anjuna': {'lat': 15.5733, 'lng': 73.7410},
      'panaji': {'lat': 15.4909, 'lng': 73.8278},
      'ootylake': {'lat': 11.4084, 'lng': 76.6874},
      'botanicalgardens': {'lat': 11.4190, 'lng': 76.7118},
      'doddabetta': {'lat': 11.4294, 'lng': 76.7370},
      'pykara': {'lat': 11.5300, 'lng': 76.6000},
      'kodaikanallake': {'lat': 10.2325, 'lng': 77.4860},
      'coakerswalk': {'lat': 10.2330, 'lng': 77.4925},
      'pillarrocks': {'lat': 10.1936, 'lng': 77.4764},
      'pineforest': {'lat': 10.2030, 'lng': 77.4780},
    };

    for (var entry in specificPlaces.entries) {
      if (normalizedName.contains(entry.key)) {
        return entry.value;
      }
    }

    // Predefined City center coordinate fallback
    final Map<String, Map<String, dynamic>> cityCenters = {
      'delhi': {'lat': 28.6139, 'lng': 77.2090},
      'newdelhi': {'lat': 28.6139, 'lng': 77.2090},
      'agra': {'lat': 27.1767, 'lng': 78.0081},
      'jaipur': {'lat': 26.9124, 'lng': 75.7873},
      'rajasthan': {'lat': 26.9124, 'lng': 75.7873},
      'munnar': {'lat': 10.0889, 'lng': 77.0595},
      'alleppey': {'lat': 9.4981, 'lng': 76.3388},
      'kochi': {'lat': 9.9312, 'lng': 76.2673},
      'kodaikanal': {'lat': 10.2381, 'lng': 77.4892},
      'ooty': {'lat': 11.4102, 'lng': 76.6950},
      'goa': {'lat': 15.2993, 'lng': 74.1240},
      'mumbai': {'lat': 19.0760, 'lng': 72.8777},
      'bangalore': {'lat': 12.9716, 'lng': 77.5946},
      'hampi': {'lat': 15.3350, 'lng': 76.4600},
    };

    for (var entry in cityCenters.entries) {
      if (normalizedName.contains(entry.key)) {
        return entry.value;
      }
    }

    for (var entry in cityCenters.entries) {
      if (normalizedContext.contains(entry.key)) {
        return entry.value;
      }
    }

    // Default center of India
    return {'lat': 20.5937, 'lng': 78.9629};
  }

  // Fetch Road Route between waypoints
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

    final mapplsProfile = travelMode == 'walking'
        ? 'walking'
        : travelMode == 'two-wheeler'
            ? 'biking'
            : 'driving';
    final osrmProfile = travelMode == 'walking' ? 'foot' : 'driving';
    final coordsQuery = validWaypoints.map((wp) => '${wp.lng},${wp.lat}').join(';');

    Map<String, dynamic>? data;
    bool routeFetched = false;

    // 1. Attempt Mappls Routing API
    if (_mapplKey.isNotEmpty) {
      try {
        final url = 'https://route.mappls.com/route/direction/route_adv/$mapplsProfile/$coordsQuery?access_token=$_mapplKey&overview=full&geometries=geojson&steps=true';
        final response = await http.get(Uri.parse(url));
        if (response.statusCode == 200) {
          final Map<String, dynamic> decoded = jsonDecode(response.body);
          if (decoded['code'] == 'Ok' && decoded['routes'] != null && (decoded['routes'] as List).isNotEmpty) {
            data = decoded;
            routeFetched = true;
          }
        }
      } catch (e) {
        debugPrint('Fetch Mappls route error: $e');
      }
    }

    // 2. Attempt OSRM Routing API Fallback
    if (!routeFetched) {
      try {
        final url = 'https://router.project-osrm.org/route/v1/$osrmProfile/$coordsQuery?overview=full&geometries=geojson&steps=true';
        final response = await http.get(Uri.parse(url));
        if (response.statusCode == 200) {
          final Map<String, dynamic> decoded = jsonDecode(response.body);
          if (decoded['code'] == 'Ok' && decoded['routes'] != null && (decoded['routes'] as List).isNotEmpty) {
            data = decoded;
            routeFetched = true;
          }
        }
      } catch (e) {
        debugPrint('Fetch OSRM route error: $e');
      }
    }

    if (routeFetched && data != null) {
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
