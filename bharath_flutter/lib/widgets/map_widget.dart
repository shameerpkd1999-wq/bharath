import 'dart:convert';
import 'dart:math' as math;
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:webview_flutter/webview_flutter.dart';
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
  // WebView States
  WebViewController? _webViewController;
  bool _mapplsLoaded = false;
  bool _useMappls = true;
  bool _disposed = false;

  // Leaflet Fallback States
  final MapController _mapController = MapController();
  double _rotation = 0.0;

  // Caching: avoid redundant snapping/splitting on every frame
  Map<String, double>? _cachedSnappedLocation;
  List<Map<String, double>>? _lastRawUserLocation;
  List<Map<String, double>>? _lastPolylineForSnap;
  List<Map<String, double>> _cachedCompleted = [];
  List<Map<String, double>> _cachedRemaining = [];

  // JS bridge debounce: prevent flooding the WebView
  bool _jsPending = false;

  // Read SDK Key from environment with fallback
  static const String _mapplKey = String.fromEnvironment(
    'MAPPLS_SDK_KEY',
    defaultValue: 'aaboszsxkdezjefndyureyrkalhergfwcqot',
  );

  @override
  void initState() {
    super.initState();
    _useMappls = _mapplKey.isNotEmpty &&
        (defaultTargetPlatform == TargetPlatform.android ||
            defaultTargetPlatform == TargetPlatform.iOS);

    if (_useMappls) {
      _initWebViewController();
    }
  }

  @override
  void dispose() {
    _disposed = true;
    _mapController.dispose();
    _webViewController = null;
    super.dispose();
  }

  void _initWebViewController() {
    _webViewController = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0x00000000))
      ..addJavaScriptChannel(
        'MapplsChannel',
        onMessageReceived: (JavaScriptMessage message) {
          if (_disposed || !mounted) return;
          try {
            final data = jsonDecode(message.message);
            if (data['event'] == 'loaded') {
              if (mounted) {
                setState(() {
                  _mapplsLoaded = true;
                });
                _sendUpdateToWeb();
              }
            } else if (data['event'] == 'error') {
              if (mounted) {
                setState(() {
                  _useMappls = false;
                });
              }
            }
          } catch (_) {}
        },
      )
      ..loadHtmlString(_buildHtmlContent(), baseUrl: 'https://bharath-dusky.vercel.app/');
  }

  // ─── Geometry helpers (cached) ──────────────────────────────────

  /// Recompute effective location + split only when inputs actually change
  void _recomputeIfNeeded() {
    final rawLoc = widget.userLocation;
    final poly = widget.polylinePoints;

    // Check if inputs changed (identity check is fast)
    if (identical(rawLoc, _lastRawUserLocation) &&
        identical(poly, _lastPolylineForSnap) &&
        _cachedSnappedLocation != null) {
      return;
    }

    _lastRawUserLocation = rawLoc as List<Map<String, double>>?;
    _lastPolylineForSnap = poly;

    if (rawLoc == null) {
      _cachedSnappedLocation = null;
      _cachedCompleted = [];
      _cachedRemaining = poly;
      return;
    }

    if (widget.startTrip && poly.isNotEmpty) {
      _cachedSnappedLocation = _snapToPolyline(rawLoc, poly);
      final split = _splitPolyline(_cachedSnappedLocation!, poly);
      _cachedCompleted = split['completed']!;
      _cachedRemaining = split['remaining']!;
    } else {
      _cachedSnappedLocation = rawLoc;
      _cachedCompleted = [];
      _cachedRemaining = poly;
    }
  }

  Map<String, double> _snapToPolyline(
    Map<String, double> currentLocation,
    List<Map<String, double>> polylinePoints,
  ) {
    if (polylinePoints.isEmpty) return currentLocation;

    final double pLat = currentLocation['lat']!;
    final double pLng = currentLocation['lng']!;

    double minDistanceSq = double.infinity;
    double snappedLat = pLat;
    double snappedLng = pLng;

    for (int i = 0; i < polylinePoints.length - 1; i++) {
      final a = polylinePoints[i];
      final b = polylinePoints[i + 1];

      final double aLat = a['lat']!;
      final double aLng = a['lng']!;
      final double bLat = b['lat']!;
      final double bLng = b['lng']!;

      final double dLat = bLat - aLat;
      final double dLng = bLng - aLng;

      final double segmentLenSq = dLat * dLat + dLng * dLng;

      double t = 0.0;
      if (segmentLenSq > 0.0) {
        t = ((pLat - aLat) * dLat + (pLng - aLng) * dLng) / segmentLenSq;
        t = t.clamp(0.0, 1.0);
      }

      final double projLat = aLat + t * dLat;
      final double projLng = aLng + t * dLng;

      final double distSq = (pLat - projLat) * (pLat - projLat) + (pLng - projLng) * (pLng - projLng);

      if (distSq < minDistanceSq) {
        minDistanceSq = distSq;
        snappedLat = projLat;
        snappedLng = projLng;
      }
    }

    // 100 meters threshold in degrees (approx)
    const double maxSnapDistanceDegrees = 0.0009;
    const double maxSnapDistanceDegreesSq = maxSnapDistanceDegrees * maxSnapDistanceDegrees;

    if (minDistanceSq > maxSnapDistanceDegreesSq) {
      return currentLocation;
    }

    return {
      ...currentLocation,
      'lat': snappedLat,
      'lng': snappedLng,
    };
  }

  Map<String, List<Map<String, double>>> _splitPolyline(
    Map<String, double> snappedLocation,
    List<Map<String, double>> polylinePoints,
  ) {
    if (polylinePoints.isEmpty) {
      return {'completed': [], 'remaining': []};
    }

    final double pLat = snappedLocation['lat']!;
    final double pLng = snappedLocation['lng']!;

    double minDistanceSq = double.infinity;
    int nearestSegmentIndex = 0;
    double bestProjLat = pLat;
    double bestProjLng = pLng;

    for (int i = 0; i < polylinePoints.length - 1; i++) {
      final a = polylinePoints[i];
      final b = polylinePoints[i + 1];

      final double aLat = a['lat']!;
      final double aLng = a['lng']!;
      final double bLat = b['lat']!;
      final double bLng = b['lng']!;

      final double dLat = bLat - aLat;
      final double dLng = bLng - aLng;

      final double segmentLenSq = dLat * dLat + dLng * dLng;

      double t = 0.0;
      if (segmentLenSq > 0.0) {
        t = ((pLat - aLat) * dLat + (pLng - aLng) * dLng) / segmentLenSq;
        t = t.clamp(0.0, 1.0);
      }

      final double projLat = aLat + t * dLat;
      final double projLng = aLng + t * dLng;

      final double distSq = (pLat - projLat) * (pLat - projLat) + (pLng - projLng) * (pLng - projLng);

      if (distSq < minDistanceSq) {
        minDistanceSq = distSq;
        nearestSegmentIndex = i;
        bestProjLat = projLat;
        bestProjLng = projLng;
      }
    }

    final snappedPoint = {'lat': bestProjLat, 'lng': bestProjLng};

    final List<Map<String, double>> completed = [];
    for (int j = 0; j <= nearestSegmentIndex; j++) {
      completed.add(polylinePoints[j]);
    }
    completed.add(snappedPoint);

    final List<Map<String, double>> remaining = [];
    remaining.add(snappedPoint);
    for (int j = nearestSegmentIndex + 1; j < polylinePoints.length; j++) {
      remaining.add(polylinePoints[j]);
    }

    return {
      'completed': completed,
      'remaining': remaining,
    };
  }

  // ─── WebView JS bridge (debounced) ──────────────────────────────

  void _sendUpdateToWeb() {
    if (!_mapplsLoaded || _webViewController == null) return;
    _recomputeIfNeeded();

    final waypointsData = widget.waypoints.map((wp) => {
      'id': wp.id,
      'placeName': wp.placeName,
      'order': wp.order,
      'lat': wp.lat,
      'lng': wp.lng,
    }).toList();

    final polylineData = widget.polylinePoints.map((pt) => {
      'lat': pt['lat'],
      'lng': pt['lng'],
    }).toList();

    final data = {
      'waypoints': waypointsData,
      'polylinePoints': polylineData,
      'completedPoints': _cachedCompleted,
      'remainingPoints': _cachedRemaining,
      'activeWaypointId': widget.activeWaypointId,
      'userLocation': _cachedSnappedLocation,
      'startTrip': widget.startTrip,
    };

    final jsonStr = jsonEncode(data);
    _webViewController?.runJavaScript('updateMap($jsonStr);');
  }

  void _sendUserLocationUpdate() {
    if (!_mapplsLoaded || _webViewController == null) return;
    _recomputeIfNeeded();
    final loc = _cachedSnappedLocation;
    if (loc == null) return;

    // Debounce: skip this call if a previous one hasn't completed yet
    if (_jsPending) return;
    _jsPending = true;

    final data = {
      'lat': loc['lat'],
      'lng': loc['lng'],
      'heading': loc['heading'] ?? 0.0,
      'startTrip': widget.startTrip,
      'completedPoints': _cachedCompleted,
      'remainingPoints': _cachedRemaining,
    };

    final jsonStr = jsonEncode(data);
    _webViewController?.runJavaScript('updateUserLocation($jsonStr);').then((_) {
      _jsPending = false;
    }).catchError((_) {
      _jsPending = false;
    });
  }

  @override
  void didUpdateWidget(covariant ItineraryMapWidget oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (_disposed) return;

    // Invalidate cache when inputs change
    if (!identical(widget.userLocation, oldWidget.userLocation) ||
        !identical(widget.polylinePoints, oldWidget.polylinePoints) ||
        widget.startTrip != oldWidget.startTrip) {
      _cachedSnappedLocation = null; // force recompute
    }

    if (_useMappls) {
      if (_mapplsLoaded) {
        final waypointsChanged = !identical(widget.waypoints, oldWidget.waypoints);
        final polylineChanged = !identical(widget.polylinePoints, oldWidget.polylinePoints);
        final activeWaypointChanged = widget.activeWaypointId != oldWidget.activeWaypointId;
        final startTripChanged = widget.startTrip != oldWidget.startTrip;

        if (waypointsChanged || polylineChanged || activeWaypointChanged || startTripChanged) {
          _sendUpdateToWeb();
        } else if (!identical(widget.userLocation, oldWidget.userLocation) && widget.userLocation != null) {
          _sendUserLocationUpdate();
        }

        if (widget.activeWaypointId != null &&
            widget.activeWaypointId != oldWidget.activeWaypointId) {
          _webViewController?.runJavaScript("setActiveWaypoint('${widget.activeWaypointId}');");
        }
      }
    } else {
      // Leaflet fallback update logic
      if (widget.activeWaypointId != null &&
          widget.activeWaypointId != oldWidget.activeWaypointId) {
        final activeWp = widget.waypoints.firstWhere(
          (wp) => wp.id == widget.activeWaypointId,
          orElse: () => Waypoint(id: '', placeName: '', order: 0, durationMin: 0, foodSpots: [], photoPoints: [], lat: 0, lng: 0),
        );
        if (activeWp.id.isNotEmpty && activeWp.lat != 0.0) {
          try {
            _mapController.move(LatLng(activeWp.lat, activeWp.lng), 14.0);
          } catch (_) {}
        }
      }

      // Live Navigation camera tracking & rotation (single atomic operation)
      _recomputeIfNeeded();
      final effectiveLocation = _cachedSnappedLocation;
      if (widget.startTrip && effectiveLocation != null) {
        final double lat = effectiveLocation['lat']!;
        final double lng = effectiveLocation['lng']!;
        final double heading = effectiveLocation['heading'] ?? 0.0;
        
        try {
          _mapController.moveAndRotate(LatLng(lat, lng), 18.0, -heading);
        } catch (_) {}
        _rotation = -heading;
      } else if (!widget.startTrip && oldWidget.startTrip) {
        try {
          _mapController.rotate(0.0);
        } catch (_) {}
        _rotation = 0.0;
      }
    }
  }

  String _buildHtmlContent() {
    return '''
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <style>
    html, body, #map {
      margin: 0; padding: 0; width: 100%; height: 100%;
      background-color: #f1f5f9;
    }
    .mappls-marker-label {
      background: white; border: 2.5px solid #4F46E5;
      border-radius: 50%; width: 26px; height: 26px;
      display: flex; align-items: center; justify-content: center;
      color: #4F46E5; font-weight: 900; font-size: 11px;
      box-shadow: 0 2px 6px rgba(0,0,0,0.15);
      font-family: system-ui, -apple-system, sans-serif;
    }
    .mappls-marker-label.active {
      background: #4F46E5; color: white;
    }
    /* GPU-accelerated marker rotation via CSS transform */
    .nav-arrow {
      will-change: transform;
      transform-origin: center center;
      display: flex; align-items: center; justify-content: center;
      width: 24px; height: 24px;
    }
    .nav-arrow svg { display: block; }
    .user-dot {
      width: 14px; height: 14px; border-radius: 50%;
      background-color: #0284c7; border: 2px solid white;
      box-shadow: 0 0 6px #0284c7;
    }
  </style>
  <script src="https://sdk.mappls.com/map/sdk/web?v=3.0&access_token=$_mapplKey"></script>
</head>
<body>
  <div id="map"></div>
  <script>
    let map = null;
    let markers = {};
    let routeBackgroundPolyline = null;
    let routeCompletedPolyline = null;
    let routeRemainingPolyline = null;
    let userMarker = null;
    let _pendingFrame = null;
    let _lastBearing = 0;

    window.onload = function() {
      if (typeof mappls === 'undefined') {
        if (window.MapplsChannel) {
          window.MapplsChannel.postMessage(JSON.stringify({ event: 'error', message: 'Mappls SDK not loaded' }));
        }
        return;
      }

      map = new mappls.Map('map', {
        center: [20.5937, 78.9629],
        zoom: 5,
        zoomControl: false,
        attributionControl: false
      });

      map.addListener('load', function() {
        if (window.MapplsChannel) {
          window.MapplsChannel.postMessage(JSON.stringify({ event: 'loaded' }));
        }
      });
    };

    function updateMap(data) {
      if (!map) return;

      if (!data.startTrip) {
        try {
          map.setPitch(0);
          map.setBearing(0);
          _lastBearing = 0;
        } catch (e) {}
      }

      // Clear previous markers
      for (let id in markers) {
        if (markers[id] && markers[id].remove) markers[id].remove();
      }
      markers = {};

      // Clear previous polylines
      if (routeBackgroundPolyline && routeBackgroundPolyline.remove) {
        routeBackgroundPolyline.remove();
        routeBackgroundPolyline = null;
      }
      if (routeCompletedPolyline && routeCompletedPolyline.remove) {
        routeCompletedPolyline.remove();
        routeCompletedPolyline = null;
      }
      if (routeRemainingPolyline && routeRemainingPolyline.remove) {
        routeRemainingPolyline.remove();
        routeRemainingPolyline = null;
      }

      const coords = [];

      // 1. Add Waypoint Markers
      const waypoints = data.waypoints || [];
      const activeWaypointId = data.activeWaypointId;

      waypoints.forEach(wp => {
        if (wp.lat && wp.lng) {
          const latLng = { lat: wp.lat, lng: wp.lng };
          coords.push([wp.lng, wp.lat]);

          const isActive = wp.id === activeWaypointId;
          const markerHtml = '<div class="mappls-marker-label' + (isActive ? ' active' : '') + '">' + wp.order + '</div>';

          const marker = new mappls.Marker({
            map: map,
            position: latLng,
            html: markerHtml,
            width: 26,
            height: 26
          });

          markers[wp.id] = marker;
        }
      });

      // 2. Add Route Polylines
      const completedPoints = data.completedPoints || [];
      const remainingPoints = data.remainingPoints || [];
      const polylinePoints = data.polylinePoints || [];

      if (polylinePoints.length > 0) {
        polylinePoints.forEach(pt => coords.push([pt.lng, pt.lat]));

        // Background polyline (border outline)
        const backgroundPath = polylinePoints.map(pt => ({ lat: pt.lat, lng: pt.lng }));
        routeBackgroundPolyline = new mappls.Polyline({
          map: map,
          paths: backgroundPath,
          strokeColor: '#94A3B8',
          strokeWeight: 8,
          strokeOpacity: 0.4
        });

        // Completed (traveled) polyline
        if (completedPoints.length > 0) {
          const completedPath = completedPoints.map(pt => ({ lat: pt.lat, lng: pt.lng }));
          routeCompletedPolyline = new mappls.Polyline({
            map: map,
            paths: completedPath,
            strokeColor: '#D0D0D0',
            strokeWeight: 5,
            strokeOpacity: 0.9
          });
        }

        // Remaining polyline
        const remainingPath = (remainingPoints.length > 0 ? remainingPoints : polylinePoints)
            .map(pt => ({ lat: pt.lat, lng: pt.lng }));
        routeRemainingPolyline = new mappls.Polyline({
          map: map,
          paths: remainingPath,
          strokeColor: '#4F46E5',
          strokeWeight: 5,
          strokeOpacity: 0.9
        });
      }

      // 3. Add User Location Marker
      const userLoc = data.userLocation;
      if (userLoc && userLoc.lat && userLoc.lng) {
        const userLatLng = { lat: userLoc.lat, lng: userLoc.lng };
        coords.push([userLoc.lng, userLoc.lat]);

        if (userMarker && userMarker.remove) {
          userMarker.remove();
        }

        const heading = userLoc.heading || 0;
        let userMarkerHtml;
        if (data.startTrip && userLoc.heading !== undefined) {
          userMarkerHtml = '<div class="nav-arrow" style="transform: rotate(' + heading + 'deg)"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2L4.5 20.29L5.21 21L12 18L18.79 21L19.5 20.29L12 2Z" fill="#3B82F6" stroke="white" stroke-width="2" stroke-linejoin="round"/></svg></div>';
        } else {
          userMarkerHtml = '<div class="user-dot"></div>';
        }

        userMarker = new mappls.Marker({
          map: map,
          position: userLatLng,
          html: userMarkerHtml,
          width: 24,
          height: 24
        });

        // 4. Update camera
        if (data.startTrip) {
          _lastBearing = heading;
          try {
            map.easeTo({
              center: [userLatLng.lng, userLatLng.lat],
              zoom: 18,
              pitch: 50,
              bearing: heading,
              duration: 500,
              easing: function(t) { return t; }
            });
          } catch (e) {
            console.error("Camera navigation error", e);
          }
        }
      } else {
        if (userMarker && userMarker.remove) {
          userMarker.remove();
          userMarker = null;
        }
      }

      // 5. Fit Bounds (only if not in active navigation mode)
      if (coords.length > 0 && !data.startTrip) {
        try {
          map.setPitch(0);
          map.setBearing(0);
          new mappls.fitBounds({
            map: map,
            bounds: coords,
            options: {
              padding: 50,
              duration: 800
            }
          });
        } catch (e) {
          console.error("fitBounds error", e);
        }
      }
    }

    function updateUserLocation(data) {
      if (!map) return;

      // Batch DOM changes inside requestAnimationFrame to avoid jank
      if (_pendingFrame) cancelAnimationFrame(_pendingFrame);
      _pendingFrame = requestAnimationFrame(function() {
        _pendingFrame = null;
        _doUpdateUserLocation(data);
      });
    }

    function _doUpdateUserLocation(data) {
      const userLatLng = { lat: data.lat, lng: data.lng };
      
      // Update marker position (reuse existing marker, avoid destroy+recreate)
      if (userMarker) {
        try {
          if (userMarker.setPosition) {
            userMarker.setPosition(userLatLng);
          } else if (userMarker.setLngLat) {
            userMarker.setLngLat([data.lng, data.lat]);
          }
          
          // Update rotation via CSS transform only (no innerHTML replacement)
          if (userMarker.getElement) {
            const heading = data.heading || 0;
            const navDiv = userMarker.getElement().querySelector('.nav-arrow');
            if (navDiv) {
              navDiv.style.transform = 'rotate(' + heading + 'deg)';
            } else if (data.startTrip) {
              // Switched from dot to arrow — need one innerHTML update
              userMarker.getElement().innerHTML = '<div class="nav-arrow" style="transform: rotate(' + heading + 'deg)"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2L4.5 20.29L5.21 21L12 18L18.79 21L19.5 20.29L12 2Z" fill="#3B82F6" stroke="white" stroke-width="2" stroke-linejoin="round"/></svg></div>';
            }
          }
        } catch (e) {
          if (userMarker.remove) userMarker.remove();
          userMarker = null;
        }
      }

      if (!userMarker) {
        const heading = data.heading || 0;
        let userMarkerHtml;
        if (data.startTrip) {
          userMarkerHtml = '<div class="nav-arrow" style="transform: rotate(' + heading + 'deg)"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2L4.5 20.29L5.21 21L12 18L18.79 21L19.5 20.29L12 2Z" fill="#3B82F6" stroke="white" stroke-width="2" stroke-linejoin="round"/></svg></div>';
        } else {
          userMarkerHtml = '<div class="user-dot"></div>';
        }
        
        userMarker = new mappls.Marker({
          map: map,
          position: userLatLng,
          html: userMarkerHtml,
          width: 24,
          height: 24
        });
      }

      // Update completed & remaining route lines — reuse objects where possible
      if (data.completedPoints && data.remainingPoints) {
        if (routeCompletedPolyline && routeCompletedPolyline.remove) {
          routeCompletedPolyline.remove();
          routeCompletedPolyline = null;
        }
        if (routeRemainingPolyline && routeRemainingPolyline.remove) {
          routeRemainingPolyline.remove();
          routeRemainingPolyline = null;
        }

        if (data.completedPoints.length > 0) {
          const completedPath = data.completedPoints.map(pt => ({ lat: pt.lat, lng: pt.lng }));
          routeCompletedPolyline = new mappls.Polyline({
            map: map,
            paths: completedPath,
            strokeColor: '#D0D0D0',
            strokeWeight: 5,
            strokeOpacity: 0.9
          });
        }

        if (data.remainingPoints.length > 0) {
          const remainingPath = data.remainingPoints.map(pt => ({ lat: pt.lat, lng: pt.lng }));
          routeRemainingPolyline = new mappls.Polyline({
            map: map,
            paths: remainingPath,
            strokeColor: '#4F46E5',
            strokeWeight: 5,
            strokeOpacity: 0.9
          });
        }
      }

      if (data.startTrip) {
        const heading = data.heading || 0;
        // Smooth shortest-path bearing interpolation on the JS side
        let targetBearing = heading;
        let delta = targetBearing - _lastBearing;
        if (delta > 180) delta -= 360;
        if (delta < -180) delta += 360;
        const smoothBearing = _lastBearing + delta * 0.35;
        _lastBearing = smoothBearing;

        try {
          map.easeTo({
            center: [data.lng, data.lat],
            zoom: 18,
            pitch: 50,
            bearing: smoothBearing,
            duration: 400,
            easing: function(t) { return t * (2 - t); } // ease-out quadratic
          });
        } catch (e) {
          console.error("Camera easeTo error", e);
        }
      } else {
        try {
          map.setPitch(0);
          map.setBearing(0);
          _lastBearing = 0;
        } catch (e) {}
      }
    }

    function setActiveWaypoint(wpId) {
      if (!map) return;
      const marker = markers[wpId];
      if (marker && marker.getPosition) {
        map.panTo(marker.getPosition());
      }
    }
  </script>
</body>
</html>
''';
  }

  @override
  Widget build(BuildContext context) {
    Widget mapContent;

    if (_useMappls && _webViewController != null) {
      mapContent = RepaintBoundary(
        child: WebViewWidget(controller: _webViewController!),
      );
    } else {
      // Leaflet Fallback View
      _recomputeIfNeeded();

      LatLng initialCenter = const LatLng(20.5937, 78.9629);
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

      final List<LatLng> routePoints = widget.polylinePoints.map((pt) {
        return LatLng(pt['lat']!, pt['lng']!);
      }).toList();

      final effectiveLocation = _cachedSnappedLocation;

      List<LatLng> completedRoutePoints = [];
      List<LatLng> remainingRoutePoints = routePoints;

      if (widget.startTrip && effectiveLocation != null && routePoints.isNotEmpty) {
        completedRoutePoints = _cachedCompleted.map((pt) => LatLng(pt['lat']!, pt['lng']!)).toList();
        remainingRoutePoints = _cachedRemaining.map((pt) => LatLng(pt['lat']!, pt['lng']!)).toList();
      }

      final List<Marker> markers = [];

      if (effectiveLocation != null) {
        final double heading = effectiveLocation['heading'] ?? 0.0;
        final isNavigating = widget.startTrip && effectiveLocation.containsKey('heading');

        markers.add(
          Marker(
            point: LatLng(effectiveLocation['lat']!, effectiveLocation['lng']!),
            width: 40,
            height: 40,
            child: Transform.rotate(
              angle: isNavigating ? heading * (math.pi / 180) : 0.0,
              child: isNavigating
                  ? Center(
                      child: Icon(
                        Icons.navigation,
                        color: Colors.blue.shade600,
                        size: 28,
                        shadows: const [
                          Shadow(
                            color: Colors.white,
                            blurRadius: 4,
                          )
                        ],
                      ),
                    )
                  : Stack(
                      alignment: Alignment.center,
                      children: [
                        Container(
                          width: 28,
                          height: 28,
                          decoration: BoxDecoration(
                            color: Colors.lightBlue.withValues(alpha: 0.35),
                            shape: BoxShape.circle,
                          ),
                        ),
                        Container(
                          width: 12,
                          height: 12,
                          decoration: const BoxDecoration(
                            color: Colors.lightBlue,
                            shape: BoxShape.circle,
                            border: Border.fromBorderSide(
                              BorderSide(color: Colors.white, width: 2.0),
                            ),
                          ),
                        ),
                      ],
                    ),
            ),
          ),
        );
      }

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
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
            ),
          ),
        );
      }

      final isDark = Theme.of(context).brightness == Brightness.dark;

      mapContent = RepaintBoundary(
        child: FlutterMap(
          mapController: _mapController,
          options: MapOptions(
            initialCenter: initialCenter,
            initialZoom: initialZoom,
            maxZoom: 18.0,
            minZoom: 3.0,
            onPositionChanged: (position, hasGesture) {
              if (hasGesture && mounted && !_disposed) {
                // Only update rotation state on user gesture, not programmatic moves
                final newRotation = _mapController.camera.rotation;
                if ((_rotation - newRotation).abs() > 0.5) {
                  setState(() {
                    _rotation = newRotation;
                  });
                }
              }
            },
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
                  // 1. Background border outline
                  Polyline(
                    points: routePoints,
                    color: isDark ? const Color(0x3F000000) : const Color(0x26000000),
                    strokeWidth: 8.0,
                  ),
                  // 2. Traveled / Completed part
                  if (widget.startTrip && completedRoutePoints.isNotEmpty)
                    Polyline(
                      points: completedRoutePoints,
                      color: const Color(0xFFD0D0D0),
                      strokeWidth: 5.0,
                    ),
                  // 3. Remaining / Untraveled part
                  Polyline(
                    points: remainingRoutePoints,
                    color: const Color(0xFF4F46E5),
                    strokeWidth: 5.0,
                  ),
                ],
              ),
            MarkerLayer(markers: markers),
          ],
        ),
      );
    }

    return ClipRRect(
      borderRadius: BorderRadius.circular(24.0),
      child: Container(
        color: const Color(0xFFF1F5F9),
        child: Stack(
          children: [
            mapContent,
            
            // Premium Floating Compass
            Positioned(
              top: 16,
              right: 16,
              child: GestureDetector(
                onTap: () {
                  if (!_useMappls && mounted && !_disposed) {
                    try {
                      _mapController.rotate(0.0);
                    } catch (_) {}
                    setState(() {
                      _rotation = 0.0;
                    });
                  }
                },
                child: AnimatedOpacity(
                  opacity: _rotation.abs() > 0.1 || _useMappls ? 1.0 : 0.6,
                  duration: const Duration(milliseconds: 200),
                  child: Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.9),
                      shape: BoxShape.circle,
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withValues(alpha: 0.1),
                          blurRadius: 8,
                          offset: const Offset(0, 3),
                        )
                      ],
                    ),
                    child: Center(
                      child: Transform.rotate(
                        angle: -_rotation * (math.pi / 180),
                        child: Stack(
                          alignment: Alignment.center,
                          children: [
                            Container(
                              width: 36,
                              height: 36,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                border: Border.all(color: const Color(0xFFE2E8F0), width: 1.5),
                              ),
                            ),
                            const Positioned(
                              top: 4,
                              child: Text(
                                'N',
                                style: TextStyle(
                                  color: Colors.red,
                                  fontSize: 9,
                                  fontWeight: FontWeight.w900,
                                ),
                              ),
                            ),
                            const Positioned(
                              bottom: 4,
                              child: Text(
                                'S',
                                style: TextStyle(
                                  color: Colors.black54,
                                  fontSize: 7,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ),
                            // Compass needle points
                            Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Container(
                                  width: 4,
                                  height: 10,
                                  decoration: const BoxDecoration(
                                    color: Colors.red,
                                    borderRadius: BorderRadius.only(
                                      topLeft: Radius.circular(2),
                                      topRight: Radius.circular(2),
                                    ),
                                  ),
                                ),
                                Container(
                                  width: 4,
                                  height: 10,
                                  decoration: const BoxDecoration(
                                    color: Colors.black45,
                                    borderRadius: BorderRadius.only(
                                      bottomLeft: Radius.circular(2),
                                      bottomRight: Radius.circular(2),
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
