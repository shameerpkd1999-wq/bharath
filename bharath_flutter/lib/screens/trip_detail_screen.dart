import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
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

  // Route Metrics & Steps
  List<Map<String, double>> _polyline = [];
  double _distanceKm = 0.0;
  double _durationMin = 0.0;
  List<RouteStep> _routeSteps = [];
  Map<String, double>? _userLocation;

  @override
  void initState() {
    super.initState();
    _loadDetails();
  }

  Future<void> _loadDetails() async {
    setState(() {
      _loading = true;
      _error = '';
    });

    try {
      // 1. Fetch parent trip doc
      final parentDoc = await _firestoreService.getTripWaypoints(widget.tripId);
      final allTrips = await _firestoreService.getPublicTrips(); // quick helper search
      
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

      setState(() {
        _trip = matchingTrip;
        _loading = false;
      });

      if (_trip != null && _trip!.waypoints.isNotEmpty) {
        _calculateRoute();
      }
    } catch (e) {
      setState(() {
        _error = 'Failed to load details: $e';
        _loading = false;
      });
    }
  }

  // Fetch routing updates from OSRM
  Future<void> _calculateRoute() async {
    if (_trip == null || _trip!.waypoints.length < 2) return;

    final routeData = await _routingService.fetchRoute(
      waypoints: _trip!.waypoints,
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
      });
    }
  }

  // Simulate Geolocation for Demo
  void _toggleLiveTrip() {
    setState(() {
      _startTrip = !_startTrip;
      if (_startTrip) {
        // Mock current location near the first waypoint
        if (_trip != null && _trip!.waypoints.isNotEmpty) {
          final firstWp = _trip!.waypoints[0];
          _userLocation = {
            'lat': firstWp.lat - 0.015, // slightly south-west
            'lng': firstWp.lng - 0.015,
          };
        }
      } else {
        _userLocation = null;
        _routeSteps = [];
      }
    });
    _calculateRoute();
  }

  // --- REDIRECTION LAUNCHERS ---
  Future<void> _launchGoogleMaps() async {
    if (_trip == null || _trip!.waypoints.isEmpty) return;

    final destWp = _trip!.waypoints.last;
    final dest = '${destWp.lat},${destWp.lng}';
    final midWaypoints = _trip!.waypoints.slice(0, _trip!.waypoints.length - 1);
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
    if (_trip == null || _trip!.waypoints.isEmpty) return;
    
    final List<String> coords = _trip!.waypoints.map((w) => '${w.lat},${w.lng}').toList();
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
    final isDark = Theme.of(context).brightness == Brightness.dark;
    
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
                    waypoints: _trip!.waypoints,
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
                            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.black),
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

                    // Timeline Stops List
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16.0),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: const [
                          Text('WAYPOINT TIMELINE', style: TextStyle(fontSize: 10, fontWeight: FontWeight.black, letterSpacing: 1.0, color: Colors.grey)),
                        ],
                      ),
                    ),

                    ListView.builder(
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      padding: const EdgeInsets.all(16),
                      itemCount: _trip!.waypoints.length,
                      itemBuilder: (context, index) {
                        final wp = _trip!.waypoints[index];
                        final isActive = _activeWaypointId == wp.id;
                        return _buildWaypointCard(context, wp, isActive);
                      },
                    ),
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
                  fontWeight: FontWeight.black,
                  color: isDark ? Colors.white60 : Colors.black54,
                ),
              ),
              if (_distanceKm > 0.0)
                Text(
                  '${_distanceKm.toStringAsFixed(1)} km • ${_formatDuration(_durationMin)}',
                  style: const TextStyle(fontSize: 10, fontWeight: FontWeight.black, color: Color(0xFF4F46E5)),
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
    final isDark = Theme.of(context).brightness == Brightness.dark;
    
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
          style: const TextStyle(fontWeight: FontWeight.black, fontSize: 13),
        ),
        subtitle: Text(
          'Stop duration: ${wp.durationMin} mins',
          style: const TextStyle(fontSize: 10, color: Colors.grey),
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
                        backgroundColor: Colors.emerald.shade50,
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
}

// Slice extension helper for list
extension ListSlice<E> on List<E> {
  List<E> slice(int start, [int? end]) {
    final int actualEnd = end ?? length;
    return sublist(start, actualEnd);
  }
}
