import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:geolocator/geolocator.dart';
import 'package:flutter_compass/flutter_compass.dart';
import '../models/route_step.dart';
import '../models/trip.dart';
import '../models/waypoint.dart';
import '../services/firestore_service.dart';
import '../services/routing_service.dart';
import '../widgets/directions_panel.dart';
import '../widgets/map_widget.dart';

class TripDetailScreen extends StatefulWidget {
  final String tripId;

  const TripDetailScreen({
    super.key,
    required this.tripId,
  });

  @override
  State<TripDetailScreen> createState() => _TripDetailScreenState();
}

class _TripDetailScreenState extends State<TripDetailScreen> {
  final _firestoreService = FirestoreService();
  final _routingService = RoutingService();

  Trip? _trip;
  bool _loading = true;
  String _error = '';

  // Navigation State
  bool _startTrip = false;
  String _travelMode = 'driving';
  String? _activeWaypointId;
  int _selectedDay = 1;

  int get _totalDays {
    if (_trip == null || _trip!.waypoints.isEmpty) return 1;
    return _trip!.waypoints.map((e) => e.day).reduce((a, b) => a > b ? a : b);
  }

  List<Waypoint> get _dayWaypoints => _trip?.waypoints.where((w) => w.day == _selectedDay).toList() ?? [];

  // Route Metrics & Steps
  List<Map<String, double>> _polyline = [];
  double _distanceKm = 0.0;
  double _durationMin = 0.0;
  List<RouteStep> _routeSteps = [];
  Map<String, double>? _userLocation;
  StreamSubscription<Position>? _positionStreamSubscription;
  StreamSubscription<CompassEvent>? _compassSubscription;
  double _compassHeading = 0.0;
  double _currentSpeed = 0.0;
  double _lastValidHeading = 0.0;
  DateTime _lastCameraUpdateTime = DateTime.fromMillisecondsSinceEpoch(0);
  bool _routeFetched = false; // Avoid re-fetching route on every GPS tick

  // Search and Suggestion State
  final TextEditingController _searchController = TextEditingController();
  List<Map<String, dynamic>> _suggestions = [];
  bool _searchingSuggestions = false;
  bool _locatingCurrent = false;
  Timer? _debounceTimer;

  @override
  void initState() {
    super.initState();
    _initCompassListener();
    _loadDetails();
  }

  @override
  void dispose() {
    _positionStreamSubscription?.cancel();
    _compassSubscription?.cancel();
    _searchController.dispose();
    _debounceTimer?.cancel();
    super.dispose();
  }

  void _initCompassListener() {
    double lastSentCompassHeading = -999.0;
    DateTime lastCompassUpdateTime = DateTime.fromMillisecondsSinceEpoch(0);

    _compassSubscription = FlutterCompass.events?.listen((CompassEvent event) {
      if (!mounted) return;
      final heading = event.heading;
      if (heading == null) return;

      // Filter out unreliable compass readings
      // accuracy: 0 = unreliable, 1 = low, 2 = medium, 3 = high
      // If accuracy data is available and too low, skip this reading
      final accuracy = event.accuracy;
      if (accuracy != null && accuracy < 15.0) {
        // Compass accuracy is measured in degrees of error on Android.
        // accuracy < 15 means the sensor is highly unreliable (needs calibration).
        // Skip and rely on GPS heading instead.
        return;
      }

      final now = DateTime.now();
      final diff = (heading - lastSentCompassHeading).abs();
      final timeDiff = now.difference(lastCompassUpdateTime).inMilliseconds;

      // Throttle: max once every 200ms and only for meaningful changes > 3 degrees
      if (lastSentCompassHeading == -999.0 || (diff > 3.0 && timeDiff > 200)) {
        lastSentCompassHeading = heading;
        lastCompassUpdateTime = now;
        _compassHeading = heading;

        // Only update map when stationary and navigation is active
        if (_startTrip && _userLocation != null && _currentSpeed < 2.0) {
          setState(() {
            _userLocation = {
              ..._userLocation!,
              'heading': heading,
            };
          });
        }
      }
    });
  }

  Future<void> _loadDetails() async {
    setState(() {
      _loading = true;
      _error = '';
    });

    try {
      // 1. Fetch parent trip doc
      final parentDoc = await _firestoreService.getTripWaypoints(widget.tripId);
      
      // Fallback: look in user trips
      Trip? matchingTrip;
      try {
        final docSnapshot = await FirebaseFirestore.instance.collection('trips').doc(widget.tripId).get();
        if (docSnapshot.exists) {
          var data = docSnapshot.data() as Map<String, dynamic>;
          data['id'] = docSnapshot.id;
          matchingTrip = Trip.fromMap(data, waypoints: parentDoc);
        }
      } catch (_) {}

      // Self-heal waypoints if they have default, 0.0, or unresolved placeholder coordinates
      final List<Waypoint> healedWaypoints = [];
      if (matchingTrip != null) {
        for (var wp in parentDoc) {
          final isZeroOrDefault = wp.lat == 0.0 || 
                                  wp.lng == 0.0 || 
                                  ((wp.lat - 20.5937).abs() < 0.001 && (wp.lng - 78.9629).abs() < 0.001);
          if (isZeroOrDefault) {
            final coords = await _routingService.resolveCoordinates(wp.placeName, matchingTrip.title);
            final healedWp = wp.copyWith(lat: coords['lat']!, lng: coords['lng']!);
            healedWaypoints.add(healedWp);

            // Sync healed coordinate back to Firestore in background
            try {
              await FirebaseFirestore.instance
                  .collection('trips')
                  .doc(widget.tripId)
                  .collection('waypoints')
                  .doc(wp.id)
                  .set({'lat': coords['lat']!, 'lng': coords['lng']!}, SetOptions(merge: true));
            } catch (_) {}
          } else {
            healedWaypoints.add(wp);
          }
        }
      }

      // Always adjust duplicate coordinates in memory to prevent overlap on map
      final List<Waypoint> finalWaypoints = _routingService.adjustDuplicateCoordinates(healedWaypoints);

      setState(() {
        _trip = matchingTrip?.copyWith(waypoints: finalWaypoints);
        _loading = false;
      });

      if (_trip != null && _trip!.waypoints.isNotEmpty) {
        _calculateRoute();
        _initUserLocationAndSort();
      }
    } catch (e) {
      setState(() {
        _error = 'Failed to load details: $e';
        _loading = false;
      });
    }
  }

  // Silently check user location and sort stops by distance on load
  Future<void> _initUserLocationAndSort() async {
    bool serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) return;

    LocationPermission permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied || permission == LocationPermission.deniedForever) {
      return;
    }

    try {
      final position = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
      );
      if (!mounted) return;

      double initialHeading = _compassHeading != 0.0 
          ? _compassHeading 
          : (position.heading != 0.0 ? position.heading : 0.0);

      setState(() {
        _userLocation = {
          'lat': position.latitude,
          'lng': position.longitude,
          'heading': initialHeading,
        };
      });
      await _arrangeWaypointsByDistance(autoSort: true);
    } catch (_) {}
  }

  // Arrange waypoints using nearest neighbor from user's location (TSP)
  Future<void> _arrangeWaypointsByDistance({bool autoSort = false}) async {
    if (_trip == null || _trip!.waypoints.isEmpty) return;

    Map<String, double>? startLoc = _userLocation;
    if (startLoc == null) {
      try {
        final position = await Geolocator.getCurrentPosition(
          desiredAccuracy: LocationAccuracy.high,
          timeLimit: const Duration(seconds: 4),
        );
        startLoc = {
          'lat': position.latitude,
          'lng': position.longitude,
          'heading': position.heading,
        };
        setState(() {
          _userLocation = startLoc;
        });
      } catch (_) {}
    }

    final currentDayWps = _trip!.waypoints.where((w) => w.day == _selectedDay).toList();
    final otherDayWps = _trip!.waypoints.where((w) => w.day != _selectedDay).toList();

    if (startLoc != null) {
      final double userLat = startLoc['lat']!;
      final double userLng = startLoc['lng']!;
      // Sort purely by distance from the user's current location, ascending
      currentDayWps.sort((a, b) {
        final distA = (a.lat - userLat) * (a.lat - userLat) + (a.lng - userLng) * (a.lng - userLng);
        final distB = (b.lat - userLat) * (b.lat - userLat) + (b.lng - userLng) * (b.lng - userLng);
        return distA.compareTo(distB);
      });
    }

    final List<Waypoint> reorderedCurrentDay = [];
    bool orderChanged = false;
    for (int i = 0; i < currentDayWps.length; i++) {
      final order = i + 1;
      if (currentDayWps[i].order != order) {
        orderChanged = true;
      }
      reorderedCurrentDay.add(currentDayWps[i].copyWith(order: order));
    }

    if (!orderChanged && autoSort) {
      return;
    }
    
    final List<Waypoint> allReordered = [...otherDayWps, ...reorderedCurrentDay];
    // Re-sort allReordered by day and order just to be clean
    allReordered.sort((a, b) {
      if (a.day != b.day) return a.day.compareTo(b.day);
      return a.order.compareTo(b.order);
    });

    setState(() {
      _trip = _trip!.copyWith(waypoints: allReordered);
      if (reorderedCurrentDay.isNotEmpty) {
        _activeWaypointId = reorderedCurrentDay[0].id;
      }
    });

    try {
      final batch = FirebaseFirestore.instance.batch();
      for (var wp in reorderedCurrentDay) {
        final docRef = FirebaseFirestore.instance
            .collection('trips')
            .doc(widget.tripId)
            .collection('waypoints')
            .doc(wp.id);
        batch.set(docRef, {'order': wp.order}, SetOptions(merge: true));
      }
      await batch.commit();
    } catch (e) {
      debugPrint('Firestore order sync failed: $e');
    }

    _calculateRoute();
  }

  // Add waypoint to list & sync to database
  Future<void> _addWaypoint(String placeName, double lat, double lng) async {
    if (_trip == null) return;

    final String newWpId = 'wp-${widget.tripId}-${DateTime.now().millisecondsSinceEpoch}';
    final int newOrder = _trip!.waypoints.length + 1;

    final newWp = Waypoint(
      id: newWpId,
      placeName: placeName,
      order: newOrder,
      durationMin: 90,
      foodSpots: [],
      photoPoints: [],
      lat: lat,
      lng: lng,
      day: _selectedDay,
    );

    setState(() {
      final updatedWps = List<Waypoint>.from(_trip!.waypoints)..add(newWp);
      _trip = _trip!.copyWith(waypoints: updatedWps);
      _activeWaypointId = newWpId;
    });

    try {
      await FirebaseFirestore.instance
          .collection('trips')
          .doc(widget.tripId)
          .collection('waypoints')
          .doc(newWpId)
          .set(newWp.toMap());
    } catch (e) {
      debugPrint('Firestore add waypoint failed: $e');
    }

    await _arrangeWaypointsByDistance();
  }

  // Remove waypoint from list & sync to database
  Future<void> _removeWaypoint(String wpId) async {
    if (_trip == null) return;

    final updatedWps = _trip!.waypoints.where((wp) => wp.id != wpId).toList();

    final List<Waypoint> reordered = [];
    for (int i = 0; i < updatedWps.length; i++) {
      reordered.add(updatedWps[i].copyWith(order: i + 1));
    }

    setState(() {
      _trip = _trip!.copyWith(waypoints: reordered);
      if (_activeWaypointId == wpId) {
        _activeWaypointId = reordered.isNotEmpty ? reordered[0].id : null;
      }
    });

    try {
      final batch = FirebaseFirestore.instance.batch();
      
      final delRef = FirebaseFirestore.instance
          .collection('trips')
          .doc(widget.tripId)
          .collection('waypoints')
          .doc(wpId);
      batch.delete(delRef);

      for (var wp in reordered) {
        final wpRef = FirebaseFirestore.instance
            .collection('trips')
            .doc(widget.tripId)
            .collection('waypoints')
            .doc(wp.id);
        batch.set(wpRef, {'order': wp.order}, SetOptions(merge: true));
      }
      
      await batch.commit();
    } catch (e) {
      debugPrint('Firestore waypoint deletion failed: $e');
    }

    _calculateRoute();
  }

  // Fetch routing updates from OSRM
  Future<void> _calculateRoute({bool force = false}) async {
    final waypoints = _dayWaypoints;
    if (waypoints.length < 2) {
      setState(() {
        _polyline = [];
        _distanceKm = 0.0;
        _durationMin = 0.0;
        _routeSteps = [];
      });
      return;
    }

    // During active navigation, only fetch the route once — the route geometry
    // is static and doesn't change when the user moves. Skip redundant calls.
    if (_startTrip && _routeFetched && !force) return;

    final routeData = await _routingService.fetchRoute(
      waypoints: waypoints,
      travelMode: _travelMode,
      userLocation: _userLocation,
      startTrip: _startTrip,
    );

    if (routeData != null) {
      setState(() {
        _polyline = routeData['polyline'];
        _distanceKm = routeData['distanceKm'];
        _durationMin = routeData['durationMin'];
        _routeSteps = routeData['steps'];
        if (_startTrip) _routeFetched = true;
      });
    }
  }

  // Live GPS Tracking & Permissions
  Future<void> _toggleLiveTrip() async {
    if (_startTrip) {
      // Stopping navigation
      setState(() {
        _startTrip = false;
        _userLocation = null;
        _routeSteps = [];
        _routeFetched = false;
      });
      await _positionStreamSubscription?.cancel();
      _positionStreamSubscription = null;
      _calculateRoute(force: true);
    } else {
      // Starting navigation - check permissions & GPS service
      bool serviceEnabled;
      LocationPermission permission;

      serviceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!serviceEnabled) {
        _showSnackbar('Location services are disabled. Please enable GPS.');
        return;
      }

      permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
        if (permission == LocationPermission.denied) {
          _showSnackbar('Location permission denied.');
          return;
        }
      }

      if (permission == LocationPermission.deniedForever) {
        _showSnackbar('Location permissions are permanently denied. Please enable in Settings.');
        return;
      }

      setState(() {
        _startTrip = true;
      });

      // Get initial position
      try {
        final position = await Geolocator.getCurrentPosition(
          desiredAccuracy: LocationAccuracy.high,
        );
        _currentSpeed = position.speed;
        double finalHeading = position.heading;
        if (position.speed >= 2.0 && position.heading != 0.0) {
          _lastValidHeading = position.heading;
          finalHeading = position.heading;
        } else {
          finalHeading = _compassHeading != 0.0 ? _compassHeading : _lastValidHeading;
        }
        setState(() {
          _userLocation = {
            'lat': position.latitude,
            'lng': position.longitude,
            'heading': finalHeading,
          };
        });
        _calculateRoute(force: true); // Fetch route once at navigation start
      } catch (e) {
        _showSnackbar('Error fetching initial location: $e');
      }

      late LocationSettings locationSettings;
      if (defaultTargetPlatform == TargetPlatform.android) {
        locationSettings = AndroidSettings(
          accuracy: LocationAccuracy.high,
          distanceFilter: 1, // 1 meter updates
          forceLocationManager: false,
          intervalDuration: const Duration(seconds: 1), // Force 1Hz refresh rate on Android
        );
      } else if (defaultTargetPlatform == TargetPlatform.iOS || defaultTargetPlatform == TargetPlatform.macOS) {
        locationSettings = AppleSettings(
          accuracy: LocationAccuracy.bestForNavigation,
          distanceFilter: 1,
          pauseLocationUpdatesAutomatically: false,
          activityType: ActivityType.automotiveNavigation,
        );
      } else {
        locationSettings = const LocationSettings(
          accuracy: LocationAccuracy.high,
          distanceFilter: 1,
        );
      }

      // Start listening to live position updates
      await _positionStreamSubscription?.cancel();
      _positionStreamSubscription = Geolocator.getPositionStream(
        locationSettings: locationSettings,
      ).listen(
        (Position position) {
          if (!mounted) return;
          
          _currentSpeed = position.speed;
          double finalHeading = _lastValidHeading;
          final now = DateTime.now();

          // Only rotate when the vehicle is actually moving (speed >= 2.0 m/s) and GPS heading is valid
          if (position.speed >= 2.0 && position.heading != 0.0) {
            double diff = (position.heading - _lastValidHeading).abs();
            if (diff > 180.0) {
              diff = 360.0 - diff;
            }

            // Rate-limit camera rotation to 400ms and ignore small angle changes (< 8 degrees)
            if (diff > 8.0 && now.difference(_lastCameraUpdateTime).inMilliseconds > 400) {
              double delta = position.heading - _lastValidHeading;
              if (delta > 180.0) delta -= 360.0;
              if (delta < -180.0) delta += 360.0;

              // Higher smoothing factor (0.35) for more responsive rotation
              double smoothedHeading = _lastValidHeading + delta * 0.35;
              smoothedHeading = (smoothedHeading + 360.0) % 360.0;

              finalHeading = smoothedHeading;
              _lastValidHeading = smoothedHeading;
              _lastCameraUpdateTime = now;
            }
          } else {
            // Use compass heading when stationary, but only if compass provided
            // a recent valid reading (compassHeading != 0). Otherwise keep last GPS heading.
            finalHeading = _compassHeading != 0.0 ? _compassHeading : _lastValidHeading;
          }
          
          setState(() {
            _userLocation = {
              'lat': position.latitude,
              'lng': position.longitude,
              'heading': finalHeading,
            };
          });
          // Do NOT call _calculateRoute() here — the route is already fetched.
          // Only the user position (userLocation) changed, which the map widget handles.
        },
        onError: (error) {
          _showSnackbar('Location tracking error: $error');
        },
      );
    }
  }

  // --- REDIRECTION LAUNCHERS ---
  Future<void> _launchGoogleMaps() async {
    final waypoints = _dayWaypoints;
    if (_trip == null || waypoints.isEmpty) return;

    final destWp = waypoints.last;
    final dest = '${destWp.lat},${destWp.lng}';
    final midWaypoints = waypoints.slice(0, waypoints.length - 1);
    final waypointsParam = midWaypoints.map((w) => '${w.lat},${w.lng}').join('|');

    String url = 'https://www.google.com/maps/dir/?api=1&destination=$dest';
    if (waypointsParam.isNotEmpty) {
      url += '&waypoints=$waypointsParam';
    }

    final modeMap = {'driving': 'driving', 'two-wheeler': 'driving', 'walking': 'walking'};
    url += '&travelmode=${modeMap[_travelMode]}';

    final uri = Uri.parse(url);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } else {
      _showSnackbar('Could not launch Google Maps');
    }
  }

  Future<void> _launchMappls() async {
    final waypoints = _dayWaypoints;
    if (_trip == null || waypoints.isEmpty) return;
    
    final List<String> coords = waypoints.map((w) => '${w.lat},${w.lng}').toList();
    final String url = 'https://mappls.com/dir/${coords.join('/')}';

    final uri = Uri.parse(url);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } else {
      _showSnackbar('Could not launch Mappls');
    }
  }

  void _showSnackbar(String text) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
  }

  String _formatDuration(double durationMin) {
    if (durationMin < 60) {
      return '${durationMin.round()} mins';
    }
    final int hours = durationMin ~/ 60;
    final int mins = (durationMin % 60).round();
    return '${hours}h ${mins}m';
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator(color: Color(0xFF4F46E5))),
      );
    }

    if (_error.isNotEmpty || _trip == null) {
      return Scaffold(
        body: Center(child: Text(_error.isNotEmpty ? _error : 'Trip not found')),
      );
    }

    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            // Top Split Pane: Map Widget (38% Height)
            SizedBox(
              height: MediaQuery.of(context).size.height * 0.38,
              child: Stack(
                children: [
                  ItineraryMapWidget(
                    waypoints: _dayWaypoints,
                    polylinePoints: _polyline,
                    activeWaypointId: _activeWaypointId,
                    userLocation: _userLocation,
                    startTrip: _startTrip,
                  ),
                  Positioned(
                    top: 10,
                    left: 10,
                    child: CircleAvatar(
                      backgroundColor: Colors.white,
                      child: IconButton(
                        icon: const Icon(Icons.arrow_back, color: Colors.black87),
                        onPressed: () => Navigator.pop(context),
                      ),
                    ),
                  ),
                ],
              ),
            ),

            // Bottom Split Pane: Details & Instructions Scroll
            Expanded(
              child: SingleChildScrollView(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // Trip Title banner
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            _trip!.title,
                            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            'Created by ${_trip!.userName}',
                            style: const TextStyle(fontSize: 10, color: Colors.grey, fontWeight: FontWeight.bold),
                          ),
                        ],
                      ),
                    ),

                    // Travel Settings Card
                    _buildSettingsCard(context),

                    // Live Directions step overlay
                    if (_startTrip && _routeSteps.isNotEmpty)
                      DirectionsPanel(steps: _routeSteps),

                    // Day Selection Tabs
                    if (_totalDays > 1) ...[
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
                        child: const Text('DAY SELECTION', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w900, letterSpacing: 1.0, color: Colors.grey)),
                      ),
                      SizedBox(
                        height: 40,
                        child: ListView.builder(
                          scrollDirection: Axis.horizontal,
                          padding: const EdgeInsets.symmetric(horizontal: 16),
                          itemCount: _totalDays,
                          itemBuilder: (context, index) {
                            final dayNum = index + 1;
                            final isSelected = _selectedDay == dayNum;
                            return GestureDetector(
                              onTap: () {
                                setState(() {
                                  _selectedDay = dayNum;
                                });
                                _calculateRoute(force: true);
                              },
                              child: Container(
                                margin: const EdgeInsets.only(right: 8),
                                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                                decoration: BoxDecoration(
                                  color: isSelected ? const Color(0xFF4F46E5) : Colors.grey.shade200,
                                  borderRadius: BorderRadius.circular(20),
                                ),
                                alignment: Alignment.center,
                                child: Text(
                                  'Day $dayNum',
                                  style: TextStyle(
                                    color: isSelected ? Colors.white : Colors.black,
                                    fontWeight: FontWeight.bold,
                                    fontSize: 12,
                                  ),
                                ),
                              ),
                            );
                          },
                        ),
                      ),
                      const SizedBox(height: 16),
                    ],

                    // Timeline Stops List
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16.0),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const Text('WAYPOINT TIMELINE', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w900, letterSpacing: 1.0, color: Colors.grey)),
                          if (_dayWaypoints.length > 2)
                            TextButton.icon(
                              onPressed: () => _arrangeWaypointsByDistance(),
                              icon: const Icon(Icons.auto_awesome, size: 12, color: Color(0xFF4F46E5)),
                              label: const Text(
                                'Optimize Route',
                                style: TextStyle(fontSize: 10, fontWeight: FontWeight.w900, color: Color(0xFF4F46E5)),
                              ),
                              style: TextButton.styleFrom(
                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                minimumSize: Size.zero,
                                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                              ),
                            ),
                        ],
                      ),
                    ),

                    if (_dayWaypoints.isEmpty)
                      const Padding(
                        padding: EdgeInsets.all(24.0),
                        child: Center(
                          child: Text(
                            'No waypoints configured for this day.',
                            style: TextStyle(fontSize: 12, color: Colors.grey, fontWeight: FontWeight.bold),
                          ),
                        ),
                      )
                    else
                      ListView.builder(
                        shrinkWrap: true,
                        physics: const NeverScrollableScrollPhysics(),
                        padding: const EdgeInsets.all(16),
                        itemCount: _dayWaypoints.length,
                        itemBuilder: (context, index) {
                          final wp = _dayWaypoints[index];
                          final isActive = _activeWaypointId == wp.id;
                          return _buildWaypointCard(context, wp, isActive);
                        },
                      ),

                    _buildAddStopSection(context),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSettingsCard(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    
    return Container(
      margin: const EdgeInsets.all(16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF0F172A) : Colors.white,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(
          color: isDark ? const Color(0xFF1E293B) : const Color(0xFFF1F5F9),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'TRAVEL MODE',
                style: TextStyle(
                  fontSize: 9,
                  fontWeight: FontWeight.w900,
                  color: isDark ? Colors.white60 : Colors.black54,
                ),
              ),
              if (_distanceKm > 0.0)
                Text(
                  '${_distanceKm.toStringAsFixed(1)} km • ${_formatDuration(_durationMin)}',
                  style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w900, color: Color(0xFF4F46E5)),
                ),
            ],
          ),
          const SizedBox(height: 8),

          // Segmented Button Mode selector
          Row(
            children: [
              _buildModeOption('driving', '🚗 Passenger', _travelMode),
              const SizedBox(width: 6),
              _buildModeOption('two-wheeler', '🏍️ Bike', _travelMode),
              const SizedBox(width: 6),
              _buildModeOption('walking', '🚶 Walk', _travelMode),
            ],
          ),
          const SizedBox(height: 16),

          ElevatedButton.icon(
            onPressed: _toggleLiveTrip,
            icon: Icon(_startTrip ? Icons.stop : Icons.play_arrow, size: 16),
            label: Text(_startTrip ? 'STOP NAVIGATION' : 'START NAVIGATION'),
            style: ElevatedButton.styleFrom(
              backgroundColor: _startTrip ? Colors.red : const Color(0xFF4F46E5),
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
          ),

          // External Map Launcher Buttons
          if (_startTrip) ...[
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: _launchGoogleMaps,
                    icon: const Icon(Icons.map, size: 14, color: Colors.green),
                    label: const Text('Google Maps', style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Colors.green)),
                    style: OutlinedButton.styleFrom(side: const BorderSide(color: Colors.green)),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: _launchMappls,
                    icon: const Icon(Icons.explore, size: 14, color: Colors.blue),
                    label: const Text('Mappls Map', style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Colors.blue)),
                    style: OutlinedButton.styleFrom(side: const BorderSide(color: Colors.blue)),
                  ),
                ),
              ],
            )
          ],
        ],
      ),
    );
  }

  Widget _buildModeOption(String mode, String label, String activeMode) {
    final isSelected = mode == activeMode;
    return Expanded(
      child: InkWell(
        onTap: () {
          setState(() => _travelMode = mode);
          _calculateRoute();
        },
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 8),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: isSelected ? const Color(0xFF4F46E5) : Colors.transparent,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: isSelected ? Colors.transparent : Colors.grey.shade200),
          ),
          child: Text(
            label,
            style: TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.bold,
              color: isSelected ? Colors.white : Colors.grey,
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildWaypointCard(BuildContext context, Waypoint wp, bool isActive) {
    double? distanceInKm;
    if (_userLocation != null && wp.lat != 0.0 && wp.lng != 0.0) {
      final double meters = Geolocator.distanceBetween(
        _userLocation!['lat']!,
        _userLocation!['lng']!,
        wp.lat,
        wp.lng,
      );
      distanceInKm = meters / 1000.0;
    }

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      child: ExpansionTile(
        key: PageStorageKey<String>(wp.id),
        initiallyExpanded: isActive,
        leading: CircleAvatar(
          backgroundColor: const Color(0xFF4F46E5),
          radius: 12,
          child: Text('${wp.order}', style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold)),
        ),
        title: Text(
          wp.placeName.split(',')[0],
          style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 13),
        ),
        subtitle: Text(
          'Stop duration: ${wp.durationMin} mins${distanceInKm != null ? ' • ${distanceInKm.toStringAsFixed(1)} km from you' : ''}',
          style: const TextStyle(fontSize: 10, color: Colors.grey),
        ),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            IconButton(
              icon: const Icon(Icons.delete_outline, color: Colors.redAccent, size: 18),
              onPressed: () {
                _removeWaypoint(wp.id);
              },
              tooltip: 'Remove stop',
            ),
            const Icon(Icons.expand_more),
          ],
        ),
        onExpansionChanged: (expanded) {
          if (expanded) {
            setState(() => _activeWaypointId = wp.id);
          }
        },
        children: [
          Padding(
            padding: const EdgeInsets.all(16.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (wp.foodSpots.isNotEmpty) ...[
                  const Text('AI FOOD RECOMMENDATIONS', style: TextStyle(fontSize: 9, fontWeight: FontWeight.bold, letterSpacing: 0.8, color: Colors.grey)),
                  const SizedBox(height: 6),
                  Wrap(
                    spacing: 6,
                    children: wp.foodSpots.map((food) {
                      return Chip(
                        label: Text(food, style: const TextStyle(fontSize: 9, fontWeight: FontWeight.bold)),
                        backgroundColor: Colors.green.shade50,
                        side: BorderSide.none,
                      );
                    }).toList(),
                  ),
                  const SizedBox(height: 12),
                ],
                if (wp.photoPoints.isNotEmpty) ...[
                  const Text('SCENIC PHOTO HIGHLIGHTS', style: TextStyle(fontSize: 9, fontWeight: FontWeight.bold, letterSpacing: 0.8, color: Colors.grey)),
                  const SizedBox(height: 6),
                  Column(
                    children: wp.photoPoints.map((photo) {
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 4.0),
                        child: Row(
                          children: [
                            const Icon(Icons.camera_alt, size: 12, color: Color(0xFF4F46E5)),
                            const SizedBox(width: 6),
                            Expanded(child: Text(photo, style: const TextStyle(fontSize: 11))),
                          ],
                        ),
                      );
                    }).toList(),
                  ),
                ],
              ],
            ),
          )
        ],
      ),
    );
  }

  void _onSearchChanged(String query) {
    if (_debounceTimer?.isActive ?? false) _debounceTimer!.cancel();
    
    final trimmed = query.trim();
    if (trimmed.length < 3) {
      setState(() {
        _suggestions = [];
      });
      return;
    }

    final urlRegex = RegExp(r'mappls\.com\/(?:pin\/)?([A-Za-z0-9]{6})', caseSensitive: false);
    final pinRegex = RegExp(r'^[A-Za-z0-9]{6}$');

    _debounceTimer = Timer(const Duration(milliseconds: 400), () async {
      setState(() {
        _searchingSuggestions = true;
      });
      try {
        if (urlRegex.hasMatch(trimmed) || pinRegex.hasMatch(trimmed)) {
          final String pin = urlRegex.hasMatch(trimmed)
              ? urlRegex.firstMatch(trimmed)!.group(1)!
              : trimmed;
          final details = await _routingService.fetchPlaceFromPin(pin);
          if (details != null && mounted) {
            setState(() {
              _suggestions = [
                {
                  'display_name': '${details['placeName']}, ${details['address']}',
                  'lat': details['lat'],
                  'lon': details['lng'],
                }
              ];
              _searchingSuggestions = false;
            });
            return;
          }
        }

        final suggestions = await _routingService.getPlaceSuggestions(query);
        setState(() {
          _suggestions = suggestions;
          _searchingSuggestions = false;
        });
      } catch (_) {
        setState(() {
          _searchingSuggestions = false;
        });
      }
    });
  }

  Future<void> _handleAddCurrentLocation() async {
    bool serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) {
      _showSnackbar('Location services are disabled.');
      return;
    }

    LocationPermission permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
      if (permission == LocationPermission.denied) {
        _showSnackbar('Location permission denied.');
        return;
      }
    }

    setState(() {
      _locatingCurrent = true;
    });

    try {
      final position = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
      );
      
      final address = await _routingService.reverseGeocode(position.latitude, position.longitude);
      final shortName = address.split(',')[0];
      
      await _addWaypoint(shortName, position.latitude, position.longitude);
    } catch (e) {
      _showSnackbar('Failed to retrieve current location: $e');
    } finally {
      setState(() {
        _locatingCurrent = false;
      });
    }
  }

  Future<void> _handleAddManualStop() async {
    final name = _searchController.text.trim();
    if (name.isEmpty) return;

    setState(() {
      _searchingSuggestions = true;
    });

    final urlRegex = RegExp(r'mappls\.com\/(?:pin\/)?([A-Za-z0-9]{6})', caseSensitive: false);
    final pinRegex = RegExp(r'^[A-Za-z0-9]{6}$');

    try {
      if (urlRegex.hasMatch(name) || pinRegex.hasMatch(name)) {
        final String pin = urlRegex.hasMatch(name)
            ? urlRegex.firstMatch(name)!.group(1)!
            : name;
        final details = await _routingService.fetchPlaceFromPin(pin);
        if (details != null) {
          await _addWaypoint(details['placeName']!, details['lat']!, details['lng']!);
          _searchController.clear();
          setState(() {
            _suggestions = [];
            _searchingSuggestions = false;
          });
          return;
        }
      }

      final coords = await _routingService.geocodePlace(name);
      if (coords != null) {
        await _addWaypoint(name, coords['lat']!, coords['lng']!);
      } else {
        await _addWaypoint(name, 20.5937, 78.9629);
      }
      _searchController.clear();
      setState(() {
        _suggestions = [];
        _searchingSuggestions = false;
      });
    } catch (_) {
      await _addWaypoint(name, 20.5937, 78.9629);
      _searchController.clear();
      setState(() {
        _suggestions = [];
        _searchingSuggestions = false;
      });
    }
  }

  Widget _buildAddStopSection(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 0, 16, 24),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF0F172A) : Colors.white,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(
          color: isDark ? const Color(0xFF1E293B) : const Color(0xFFF1F5F9),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Row(
            children: [
              Icon(Icons.add_location_alt_outlined, size: 16, color: Color(0xFF4F46E5)),
              SizedBox(width: 8),
              Text(
                'ADD NEW SPOT',
                style: TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w900,
                  color: Colors.grey,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _searchController,
                  onChanged: _onSearchChanged,
                  style: const TextStyle(fontSize: 12),
                  decoration: InputDecoration(
                    hintText: 'Search and add a place...',
                    prefixIcon: const Icon(Icons.search, size: 16),
                    contentPadding: const EdgeInsets.symmetric(vertical: 8),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: BorderSide(
                        color: isDark ? const Color(0xFF1E293B) : Colors.grey.shade200,
                      ),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: BorderSide(
                        color: isDark ? const Color(0xFF1E293B) : Colors.grey.shade200,
                      ),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              IconButton(
                onPressed: _handleAddCurrentLocation,
                icon: _locatingCurrent
                    ? const SizedBox(
                        height: 16,
                        width: 16,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Color(0xFF4F46E5)),
                      )
                    : const Icon(Icons.my_location, size: 18, color: Color(0xFF4F46E5)),
                style: IconButton.styleFrom(
                  backgroundColor: isDark ? const Color(0xFF1E293B) : Colors.grey.shade100,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  padding: const EdgeInsets.all(10),
                ),
                tooltip: 'Use current location',
              ),
              const SizedBox(width: 8),
              ElevatedButton(
                onPressed: _handleAddManualStop,
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF4F46E5),
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                ),
                child: const Text('Add', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            'Search place, Mappls Pin, or paste a Mappls link (e.g. 0mxcrz or mappls.com/0mxcrz)',
            style: TextStyle(
              fontSize: 9,
              color: isDark ? Colors.white54 : Colors.black54,
              fontWeight: FontWeight.w500,
            ),
          ),
          
          if (_searchingSuggestions)
            const Padding(
              padding: EdgeInsets.only(top: 12),
              child: Center(
                child: SizedBox(
                  height: 20,
                  width: 20,
                  child: CircularProgressIndicator(strokeWidth: 2, color: Color(0xFF4F46E5)),
                ),
              ),
            ),

          if (_suggestions.isNotEmpty)
            Container(
              margin: const EdgeInsets.only(top: 8),
              decoration: BoxDecoration(
                color: isDark ? const Color(0xFF1E293B) : Colors.grey.shade50,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: isDark ? const Color(0xFF334155) : Colors.grey.shade200,
                ),
              ),
              constraints: const BoxConstraints(maxHeight: 180),
              child: ListView.builder(
                shrinkWrap: true,
                padding: EdgeInsets.zero,
                itemCount: _suggestions.length,
                itemBuilder: (context, idx) {
                  final item = _suggestions[idx];
                  return ListTile(
                    dense: true,
                    leading: const Icon(Icons.map, size: 16, color: Color(0xFF4F46E5)),
                    title: Text(
                      item['display_name']?.split(',')[0] ?? '',
                      style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold),
                    ),
                    subtitle: Text(
                      item['display_name'] ?? '',
                      style: const TextStyle(fontSize: 10, color: Colors.grey),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    onTap: () {
                      _addWaypoint(
                        item['display_name']?.split(',')[0] ?? '',
                        item['lat'],
                        item['lon'],
                      );
                      setState(() {
                        _suggestions = [];
                        _searchController.clear();
                      });
                    },
                  );
                },
              ),
            ),
        ],
      ),
    );
  }
}

// Slice extension helper for list
extension ListSlice<E> on List<E> {
  List<E> slice(int start, [int? end]) {
    final int actualEnd = end ?? length;
    return sublist(start, actualEnd);
  }
}
