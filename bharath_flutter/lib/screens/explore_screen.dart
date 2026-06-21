import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../models/trip.dart';
import '../services/auth_service.dart';
import '../services/firestore_service.dart';
import 'trip_detail_screen.dart';

class ExploreScreen extends StatefulWidget {
  const ExploreScreen({super.key});

  @override
  State<ExploreScreen> createState() => _ExploreScreenState();
}

class _ExploreScreenState extends State<ExploreScreen> {
  final FirestoreService _firestoreService = FirestoreService();
  List<Trip> _publicTrips = [];
  bool _loading = true;
  String _error = '';

  @override
  void initState() {
    super.initState();
    _loadFeed();
  }

  Future<void> _loadFeed() async {
    setState(() {
      _loading = true;
      _error = '';
    });

    try {
      final trips = await _firestoreService.getPublicTrips();
      setState(() {
        _publicTrips = trips;
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = 'Failed to load public trips: $e';
        _loading = false;
      });
    }
  }

  void _cloneTrip(Trip trip) async {
    final auth = Provider.of<AuthService>(context, listen: false);
    if (auth.user == null) return;

    // Show loading spinner dialog
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) => const Center(
        child: CircularProgressIndicator(color: Color(0xFF4F46E5)),
      ),
    );

    try {
      await _firestoreService.cloneTrip(
        trip,
        auth.user!.uid,
        auth.user!.displayName ?? 'Explorer',
      );
      if (mounted) {
        Navigator.pop(context); // Close spinner
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Trip cloned to My Trips successfully!'),
            backgroundColor: Colors.green,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        Navigator.pop(context); // Close spinner
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Cloning failed: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'Community Feed',
          style: TextStyle(fontWeight: FontWeight.black, fontSize: 18),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loadFeed,
          )
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: Color(0xFF4F46E5)))
          : _error.isNotEmpty
              ? Center(child: Text(_error, style: const TextStyle(color: Colors.red, fontSize: 12)))
              : _publicTrips.isEmpty
                  ? Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.feed_outlined, size: 48, color: Colors.grey.withOpacity(0.5)),
                          const SizedBox(height: 12),
                          const Text(
                            'No public itineraries shared yet.',
                            style: TextStyle(color: Colors.grey, fontSize: 12, fontWeight: FontWeight.bold),
                          ),
                        ],
                      ),
                    )
                  : RefreshIndicator(
                      onRefresh: _loadFeed,
                      color: const Color(0xFF4F46E5),
                      child: ListView.separated(
                        padding: const EdgeInsets.all(16),
                        itemCount: _publicTrips.length,
                        separatorBuilder: (context, index) => const SizedBox(height: 16),
                        itemBuilder: (context, index) {
                          final trip = _publicTrips[index];
                          return _buildTripCard(context, trip);
                        },
                      ),
                    ),
    );
  }

  Widget _buildTripCard(BuildContext context, Trip trip) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final cover = trip.coverUrl ?? 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?q=80&w=600&auto=format&fit=crop';
    
    return InkWell(
      onTap: () {
        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (context) => TripDetailScreen(tripId: trip.id),
          ),
        );
      },
      borderRadius: BorderRadius.circular(24),
      child: Container(
        decoration: BoxDecoration(
          color: isDark ? const Color(0xFF0F172A) : Colors.white,
          borderRadius: BorderRadius.circular(24),
          border: Border.all(
            color: isDark ? const Color(0xFF1E293B) : const Color(0xFFF1F5F9),
          ),
          boxShadow: const [
            BoxShadow(
              color: Colors.black12,
              blurRadius: 8,
              offset: Offset(0, 4),
            )
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Image Cover
            ClipRRect(
              borderRadius: const BorderRadius.vertical(top: Radius.circular(23)),
              child: Image.network(
                cover,
                height: 140,
                fit: BoxFit.cover,
                errorBuilder: (context, error, stackTrace) => Container(
                  height: 140,
                  color: Colors.grey.shade200,
                  alignment: Alignment.center,
                  child: const Icon(Icons.image_not_supported, color: Colors.grey),
                ),
              ),
            ),
            
            // Details
            Padding(
              padding: const EdgeInsets.all(16.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                        decoration: BoxDecoration(
                          color: const Color(0xFF4F46E5).withOpacity(0.08),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Row(
                          children: [
                            const Icon(Icons.location_on, size: 10, color: Color(0xFF4F46E5)),
                            const SizedBox(width: 3),
                            Text(
                              '${trip.waypoints.length} Stops',
                              style: const TextStyle(
                                fontSize: 9,
                                fontWeight: FontWeight.black,
                                color: Color(0xFF4F46E5),
                              ),
                            ),
                          ],
                        ),
                      ),
                      Text(
                        'By ${trip.userName}',
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.bold,
                          color: isDark ? Colors.white60 : Colors.black54,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(
                    trip.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.black,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    trip.sourceText,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 11,
                      color: isDark ? Colors.white38 : Colors.black38,
                    ),
                  ),
                  const Divider(height: 24),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [
                      TextButton.icon(
                        onPressed: () => _cloneTrip(trip),
                        icon: const Icon(Icons.copy, size: 14, color: Color(0xFF4F46E5)),
                        label: const Text(
                          'CLONE TRIP',
                          style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.black,
                            color: Color(0xFF4F46E5),
                            letterSpacing: 1.0,
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
