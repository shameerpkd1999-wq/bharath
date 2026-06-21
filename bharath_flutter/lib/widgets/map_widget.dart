import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import '../models/waypoint.dart';

class ItineraryMapWidget extends StatefulWidget {
  final List<Waypoint> waypoints;
  final List<Map<String, double>> polylinePoints;
  final String? activeWaypointId;
  final Map<String, double>? userLocation;
  final bool startTrip;

  const ItineraryMapWidget({
    super.key,
    required this.waypoints,
    required this.polylinePoints,
    this.activeWaypointId,
    this.userLocation,
    this.startTrip = false,
  });

  @override
  State<ItineraryMapWidget> createState() => _ItineraryMapWidgetState();
}

class _ItineraryMapWidgetState extends State<ItineraryMapWidget> {
  final MapController _mapController = MapController();

  @override
  void didUpdateWidget(covariant ItineraryMapWidget oldWidget) {
    super.didUpdateWidget(oldWidget);
    
    // Pan to active waypoint if it changes
    if (widget.activeWaypointId != null && 
        widget.activeWaypointId != oldWidget.activeWaypointId) {
      final activeWp = widget.waypoints.firstWhere(
        (wp) => wp.id == widget.activeWaypointId,
        orElse: () => Waypoint(id: '', placeName: '', order: 0, durationMin: 0, foodSpots: [], photoPoints: [], lat: 0, lng: 0),
      );
      if (activeWp.id.isNotEmpty && activeWp.lat != 0.0) {
        _mapController.move(LatLng(activeWp.lat, activeWp.lng), 14.0);
      }
    }

    // Pan to user location if startTrip turns true
    if (widget.startTrip && !oldWidget.startTrip && widget.userLocation != null) {
      _mapController.move(
        LatLng(widget.userLocation!['lat']!, widget.userLocation!['lng']!), 
        15.0
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    // 1. Build Route Polyline Points
    final List<LatLng> routePoints = widget.polylinePoints.map((pt) {
      return LatLng(pt['lat']!, pt['lng']!);
    }).toList();

    // 2. Build Markers
    final List<Marker> markers = [];

    // User Location Marker
    if (widget.userLocation != null) {
      markers.add(
        Marker(
          point: LatLng(widget.userLocation!['lat']!, widget.userLocation!['lng']!),
          width: 30,
          height: 30,
          child: Stack(
            alignment: Alignment.center,
            children: [
              Container(
                width: 28,
                height: 28,
                decoration: BoxDecoration(
                  color: Colors.skyBlue.withOpacity(0.35),
                  shape: BoxShape.circle,
                ),
              ),
              Container(
                width: 12,
                height: 12,
                decoration: const BoxDecoration(
                  color: Colors.skyBlue,
                  shape: BoxShape.circle,
                  border: Border.fromBorderSide(
                    BorderSide(color: Colors.white, width: 2.0),
                  ),
                ),
              ),
            ],
          ),
        ),
      );
    }

    // Waypoint Markers
    for (var wp in widget.waypoints) {
      if (wp.lat == 0.0 || wp.lng == 0.0) continue;
      
      final isActive = wp.id == widget.activeWaypointId;
      markers.add(
        Marker(
          point: LatLng(wp.lat, wp.lng),
          width: 36,
          height: 36,
          child: AnimatedScale(
            scale: isActive ? 1.15 : 1.0,
            duration: const Duration(milliseconds: 250),
            child: Container(
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: isActive ? const Color(0xFF4F46E5) : Colors.white,
                shape: BoxShape.circle,
                border: Border.all(
                  color: const Color(0xFF4F46E5),
                  width: 2.5,
                ),
                boxShadow: const [
                  BoxShadow(
                    color: Colors.black12,
                    blurRadius: 6,
                    offset: Offset(0, 3),
                  )
                ],
              ),
              child: Text(
                '${wp.order}',
                style: TextStyle(
                  color: isActive ? Colors.white : const Color(0xFF4F46E5),
                  fontSize: 12,
                  fontWeight: FontWeight.black,
                ),
              ),
            ),
          ),
        ),
      );
    }

    // Determine initial center
    LatLng initialCenter = const LatLng(20.5937, 78.9629); // Center of India
    double initialZoom = 5.0;

    if (widget.waypoints.isNotEmpty) {
      final firstValid = widget.waypoints.firstWhere(
        (wp) => wp.lat != 0.0,
        orElse: () => Waypoint(id: '', placeName: '', order: 0, durationMin: 0, foodSpots: [], photoPoints: [], lat: 0, lng: 0),
      );
      if (firstValid.id.isNotEmpty) {
        initialCenter = LatLng(firstValid.lat, firstValid.lng);
        initialZoom = 11.0;
      }
    }

    return ClipRRect(
      borderRadius: BorderRadius.circular(24.0),
      child: FlutterMap(
        mapController: _mapController,
        options: MapOptions(
          initialCenter: initialCenter,
          initialZoom: initialZoom,
          maxZoom: 18.0,
          minZoom: 3.0,
        ),
        children: [
          TileLayer(
            urlTemplate: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
            subdomains: const ['a', 'b', 'c', 'd'],
            userAgentPackageName: 'com.bharatyatra.app',
          ),
          if (routePoints.isNotEmpty)
            PolylineLayer(
              polylines: [
                Polyline(
                  points: routePoints,
                  color: const Color(0xFF4F46E5),
                  strokeWidth: 4.0,
                  isDotted: true,
                  borderColor: const Color(0xFF818CF8),
                  borderStrokeWidth: 1.0,
                ),
              ],
            ),
          MarkerLayer(markers: markers),
        ],
      ),
    );
  }
}
