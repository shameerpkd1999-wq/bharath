import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../models/trip.dart';
import '../models/waypoint.dart';
import '../services/auth_service.dart';
import '../services/firestore_service.dart';
import '../services/gemini_service.dart';
import '../services/routing_service.dart';
import 'trip_detail_screen.dart';

class CreateTripScreen extends StatefulWidget {
  const CreateTripScreen({super.key});

  @override
  State<CreateTripScreen> createState() => _CreateTripScreenState();
}

class _CreateTripScreenState extends State<CreateTripScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final _firestoreService = FirestoreService();
  final _routingService = RoutingService();

  // AI Tab State
  String _aiPrompt = '';
  int _aiDays = 3;
  String _aiBudget = 'economy';
  String _aiCompanions = 'solo';
  String _aiCoverUrl = 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?q=80&w=600&auto=format&fit=crop';
  final _customCoverController = TextEditingController();
  bool _aiGenerating = false;

  // Custom Tab State
  final _customTitleController = TextEditingController();
  final _searchController = TextEditingController();
  List<Waypoint> _customStops = [];
  List<Map<String, dynamic>> _suggestions = [];
  bool _searchingSuggestions = false;

  final List<Map<String, String>> _coverPresets = [
    {'id': 'wanderlust', 'label': 'Wanderlust', 'url': 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?q=80&w=600&auto=format&fit=crop'},
    {'id': 'tajmahal', 'label': 'Taj Mahal', 'url': 'https://images.unsplash.com/photo-1564507592333-c60657eea523?q=80&w=600&auto=format&fit=crop'},
    {'id': 'jaipur', 'label': 'Jaipur', 'url': 'https://images.unsplash.com/photo-1477584308802-e9c378852d92?q=80&w=600&auto=format&fit=crop'},
    {'id': 'kerala', 'label': 'Kerala', 'url': 'https://images.unsplash.com/photo-1593693397690-362cb9666fc2?q=80&w=600&auto=format&fit=crop'},
    {'id': 'goa', 'label': 'Goa', 'url': 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?q=80&w=600&auto=format&fit=crop'},
    {'id': 'mountains', 'label': 'Mountains', 'url': 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?q=80&w=600&auto=format&fit=crop'},
  ];

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    _customCoverController.dispose();
    _customTitleController.dispose();
    _searchController.dispose();
    super.dispose();
  }

  // --- AI GENERATION ACTION ---
  void _generateAITrip() async {
    if (_aiPrompt.trim().isEmpty) {
      _showSnackbar('Please enter a destination or prompt');
      return;
    }

    setState(() => _aiGenerating = true);

    final auth = Provider.of<AuthService>(context, listen: false);
    if (auth.user == null) {
      _showSnackbar('Authentication required');
      setState(() => _aiGenerating = false);
      return;
    }

    // Try to read API key from a safe local/secure storage or default config
    // For demo purposes, we can let user enter key or read environment (e.g. String.fromEnvironment)
    const geminiKey = String.fromEnvironment('GEMINI_API_KEY', defaultValue: '');
    final geminiService = GeminiService(apiKey: geminiKey);

    try {
      final res = await geminiService.generateItinerary(
        text: _aiPrompt,
        duration: _aiDays,
        budget: _aiBudget,
        companions: _aiCompanions,
        userId: auth.user!.uid,
        userName: auth.user!.displayName ?? 'Explorer',
        coverUrl: _aiCoverUrl,
      );

      final Trip trip = res['trip'];
      final List<Waypoint> waypoints = res['waypoints'];

      // Geocode waypoints coordinates in background using geocoding service
      for (var wp in waypoints) {
        final coords = await _routingService.geocodePlace(wp.placeName);
        if (coords != null) {
          int index = waypoints.indexOf(wp);
          waypoints[index] = Waypoint(
            id: wp.id,
            placeName: wp.placeName,
            order: wp.order,
            durationMin: wp.durationMin,
            foodSpots: wp.foodSpots,
            photoPoints: wp.photoPoints,
            lat: coords['lat']!,
            lng: coords['lng']!,
          );
        }
      }

      // Save to Firebase
      final tripId = await _firestoreService.saveTrip(trip, waypoints);

      if (mounted) {
        _showSnackbar('Itinerary Generated Successfully!');
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(builder: (context) => TripDetailScreen(tripId: tripId)),
        );
      }
    } catch (e) {
      _showSnackbar('Generation failed: $e');
    } finally {
      if (mounted) setState(() => _aiGenerating = false);
    }
  }

  // --- CUSTOM ROUTE BUILDER ACTIONS ---
  void _searchSuggestions(String query) async {
    if (query.trim().length < 3) {
      setState(() => _suggestions = []);
      return;
    }
    setState(() => _searchingSuggestions = true);
    final data = await _routingService.getPlaceSuggestions(query);
    setState(() {
      _suggestions = data;
      _searchingSuggestions = false;
    });
  }

  // Handle Autocomplete selection
  void _addStopFromSuggestion(Map<String, dynamic> place) {
    setState(() {
      final newWp = Waypoint(
        id: 'wp-${DateTime.now().millisecondsSinceEpoch}',
        placeName: place['display_name'], // Preserves FULL display name
        order: _customStops.length + 1,
        durationMin: 90,
        foodSpots: [],
        photoPoints: [],
        lat: place['lat'],
        lng: place['lon'],
      );
      _customStops.add(newWp);
      _searchController.clear();
      _suggestions = [];
    });
  }

  // Handle Maps link pastes (Google / Mappls)
  void _importMapLink(String link) async {
    _searchController.clear();
    
    // Simple Mappls parser logic
    if (link.contains('mappls.com')) {
      // 1. Coordinates: /@lat,lng
      final coordReg = RegExp(r'@(-?\d+\.\d+),(-?\d+\.\d+)');
      final match = coordReg.firstMatch(link);
      if (match != null) {
        final double lat = double.parse(match.group(1)!);
        final double lng = double.parse(match.group(2)!);
        _addStopDirectly('Mappls Location (${lat.toStringAsFixed(4)}, ${lng.toStringAsFixed(4)})', lat, lng);
        return;
      }

      // 2. Navigation places: ?places=lat,lng,name
      final placesUri = Uri.parse(link);
      final placesParam = placesUri.queryParameters['places'];
      if (placesParam != null) {
        final parts = placesParam.split(',');
        if (parts.length >= 2) {
          final double lat = double.parse(parts[0]);
          final double lng = double.parse(parts[1]);
          final String name = parts.length > 2 ? Uri.decodeComponent(parts[2]).replaceAll('+', ' ') : 'Mappls Destination';
          _addStopDirectly(name, lat, lng);
          return;
        }
      }

      // 3. Mappls Pins (e.g. /9ADJ1X)
      final path = Uri.parse(link).path.replaceFirst('/', '').trim();
      if (path.length == 6 && !path.contains('/')) {
        _showSnackbar('Mappls Pin detected. Resolving coordinates...');
        final coords = await _routingService.geocodePlace('Mappls Pin: $path');
        _addStopDirectly('Mappls Pin: $path', coords?['lat'] ?? 20.5937, coords?['lng'] ?? 78.9629);
        return;
      }
    }

    _showSnackbar('Invalid maps link. Please enter a valid URL.');
  }

  void _addStopDirectly(String name, double lat, double lng) {
    setState(() {
      _customStops.add(Waypoint(
        id: 'wp-${DateTime.now().millisecondsSinceEpoch}',
        placeName: name,
        order: _customStops.length + 1,
        durationMin: 90,
        foodSpots: [],
        photoPoints: [],
        lat: lat,
        lng: lng,
      ));
    });
  }

  void _createCustomRoute() async {
    if (_customTitleController.text.trim().isEmpty) {
      _showSnackbar('Please enter a trip title');
      return;
    }
    if (_customStops.length < 2) {
      _showSnackbar('Please add at least 2 stops for a route');
      return;
    }

    final auth = Provider.of<AuthService>(context, listen: false);
    if (auth.user == null) return;

    final trip = Trip(
      id: 'trip-${DateTime.now().millisecondsSinceEpoch}',
      userId: auth.user!.uid,
      userName: auth.user!.displayName ?? 'Explorer',
      title: _customTitleController.text.trim(),
      isPublic: false,
      sourceText: 'Custom Route Builder',
      createdAt: DateTime.now().toIso8601String(),
      coverUrl: _aiCoverUrl,
    );

    final tripId = await _firestoreService.saveTrip(trip, _customStops);
    
    if (mounted) {
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(builder: (context) => TripDetailScreen(tripId: tripId)),
      );
    }
  }

  void _showSnackbar(String text) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final primaryColor = isDark ? const Color(0xFF818CF8) : const Color(0xFF4F46E5);

    return Scaffold(
      appBar: AppBar(
        title: const Text('New Itinerary', style: TextStyle(fontWeight: FontWeight.black, fontSize: 18)),
        bottom: TabBar(
          controller: _tabController,
          indicatorColor: primaryColor,
          labelColor: primaryColor,
          labelStyle: const TextStyle(fontWeight: FontWeight.bold),
          tabs: const [
            Tab(icon: Icon(Icons.bolt), text: 'AI Assistant'),
            Tab(icon: Icon(Icons.map), text: 'Custom Builder'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          _buildAIAssistantTab(),
          _buildCustomBuilderTab(),
        ],
      ),
    );
  }

  // --- AI ASSISTANT TAB VIEW ---
  Widget _buildAIAssistantTab() {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text('Where are you heading?', style: TextStyle(fontSize: 14, fontWeight: FontWeight.black)),
          const SizedBox(height: 8),
          TextField(
            onChanged: (val) => _aiPrompt = val,
            decoration: InputDecoration(
              hintText: 'e.g. Kerala backwaters, 3 days in Jaipur, Agra Taj Mahal walk...',
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(16)),
              prefixIcon: const Icon(Icons.search),
            ),
          ),
          const SizedBox(height: 20),

          // Days Slider
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text('Duration', style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold)),
              Text('$_aiDays Days', style: TextStyle(fontSize: 13, fontWeight: FontWeight.black, color: const Color(0xFF4F46E5))),
            ],
          ),
          Slider(
            value: _aiDays.toDouble(),
            min: 1,
            max: 14,
            divisions: 13,
            activeColor: const Color(0xFF4F46E5),
            onChanged: (val) => setState(() => _aiDays = val.toInt()),
          ),
          const SizedBox(height: 16),

          // Budget Selector
          const Text('Budget', style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          Row(
            children: [
              _buildRadioOption('economy', 'Economy 🪙', _aiBudget, (v) => setState(() => _aiBudget = v)),
              const SizedBox(width: 8),
              _buildRadioOption('standard', 'Standard 💵', _aiBudget, (v) => setState(() => _aiBudget = v)),
              const SizedBox(width: 8),
              _buildRadioOption('premium', 'Premium 💎', _aiBudget, (v) => setState(() => _aiBudget = v)),
            ],
          ),
          const SizedBox(height: 16),

          // Companions Selector
          const Text('Traveling Companions', style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          Row(
            children: [
              _buildRadioOption('solo', 'Solo 🚶', _aiCompanions, (v) => setState(() => _aiCompanions = v)),
              const SizedBox(width: 8),
              _buildRadioOption('couple', 'Couple 👩‍❤️‍👨', _aiCompanions, (v) => setState(() => _aiCompanions = v)),
              const SizedBox(width: 8),
              _buildRadioOption('family', 'Family 👨‍👩‍👧', _aiCompanions, (v) => setState(() => _aiCompanions = v)),
            ],
          ),
          const SizedBox(height: 24),

          // Cover Presets Card
          const Text('Choose Cover Theme', style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          _buildCoverThemeSelector(),
          const SizedBox(height: 28),

          ElevatedButton(
            onPressed: _aiGenerating ? null : _generateAITrip,
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF4F46E5),
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 16),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            ),
            child: _aiGenerating
                ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                : const Text('Generate AI Itinerary', style: TextStyle(fontWeight: FontWeight.black, fontSize: 13)),
          ),
        ],
      ),
    );
  }

  // --- CUSTOM BUILDER TAB VIEW ---
  Widget _buildCustomBuilderTab() {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text('Trip Title', style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          TextField(
            controller: _customTitleController,
            decoration: InputDecoration(
              hintText: 'e.g. Scenic Tour of Jaipur',
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(16)),
            ),
          ),
          const SizedBox(height: 20),

          // Add Stops Search Autocomplete or Paste Maps Links
          const Text('Add Stops (Search or paste Maps link)', style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          Stack(
            clipBehavior: Clip.none,
            children: [
              TextField(
                controller: _searchController,
                onChanged: (val) {
                  if (val.trim().startsWith('http')) return;
                  _searchSuggestions(val);
                },
                decoration: InputDecoration(
                  hintText: 'Type place name or paste Google/Mappls link...',
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(16)),
                  prefixIcon: const Icon(Icons.add_location_alt_outlined),
                  suffixIcon: IconButton(
                    icon: const Icon(Icons.input),
                    onPressed: () {
                      final txt = _searchController.text.trim();
                      if (txt.startsWith('http')) {
                        _importMapLink(txt);
                      }
                    },
                  ),
                ),
              ),

              // Autocomplete overlay list
              if (_searchingSuggestions)
                Positioned(
                  top: 60,
                  left: 0,
                  right: 0,
                  zIndex: 10,
                  child: Card(
                    child: Padding(
                      padding: const EdgeInsets.all(12.0),
                      child: Row(
                        children: const [
                          CircularProgressIndicator(strokeWidth: 2),
                          SizedBox(width: 12),
                          Text('Searching suggestions...', style: TextStyle(fontSize: 11)),
                        ],
                      ),
                    ),
                  ),
                )
              else if (_suggestions.isNotEmpty)
                Positioned(
                  top: 60,
                  left: 0,
                  right: 0,
                  zIndex: 10,
                  child: Card(
                    elevation: 8,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxHeight: 180),
                      child: ListView.builder(
                        shrinkWrap: true,
                        itemCount: _suggestions.length,
                        itemBuilder: (context, index) {
                          final item = _suggestions[index];
                          return ListTile(
                            leading: const Icon(Icons.map, size: 16),
                            title: Text(
                              item['display_name'].toString().split(',')[0],
                              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold),
                            ),
                            subtitle: Text(
                              item['display_name'],
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(fontSize: 9),
                            ),
                            onTap: () => _addStopFromSuggestion(item),
                          );
                        },
                      ),
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 24),

          // Route Timeline List
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('Route Stops (${_customStops.length})', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold)),
              if (_customStops.length > 1)
                const Text('Drag items to reorder', style: TextStyle(fontSize: 9, color: Colors.grey)),
            ],
          ),
          const SizedBox(height: 8),

          _customStops.isEmpty
              ? Container(
                  padding: const EdgeInsets.all(32),
                  decoration: BoxDecoration(
                    color: isDark ? const Color(0xFF1E293B) : Colors.grey.shade50,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(style: BorderStyle.solid, color: Colors.grey.shade300),
                  ),
                  child: const Text(
                    'No stops added to your route yet.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Colors.grey, fontSize: 11),
                  ),
                )
              : ListView.builder(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  itemCount: _customStops.length,
                  itemBuilder: (context, index) {
                    final wp = _customStops[index];
                    return Card(
                      margin: const EdgeInsets.only(bottom: 12),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                      child: ListTile(
                        leading: CircleAvatar(
                          radius: 12,
                          backgroundColor: const Color(0xFF4F46E5),
                          child: Text('${index + 1}', style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold)),
                        ),
                        title: Text(
                          wp.placeName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold),
                        ),
                        trailing: IconButton(
                          icon: const Icon(Icons.delete_outline, color: Colors.red, size: 18),
                          onPressed: () {
                            setState(() {
                              _customStops.removeAt(index);
                              // re-order
                              for (int i = 0; i < _customStops.length; i++) {
                                _customStops[i] = Waypoint(
                                  id: _customStops[i].id,
                                  placeName: _customStops[i].placeName,
                                  order: i + 1,
                                  durationMin: _customStops[i].durationMin,
                                  foodSpots: _customStops[i].foodSpots,
                                  photoPoints: _customStops[i].photoPoints,
                                  lat: _customStops[i].lat,
                                  lng: _customStops[i].lng,
                                );
                              }
                            });
                          },
                        ),
                      ),
                    );
                  },
                ),
          const SizedBox(height: 20),

          // Cover Theme
          const Text('Choose Cover Theme', style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          _buildCoverThemeSelector(),
          const SizedBox(height: 28),

          ElevatedButton(
            onPressed: _createCustomRoute,
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF4F46E5),
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 16),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
            ),
            child: const Text('Create Custom Route', style: TextStyle(fontWeight: FontWeight.black, fontSize: 13)),
          ),
        ],
      ),
    );
  }

  // --- REUSABLE OPTIONS SELECTOR ---
  Widget _buildRadioOption(String value, String label, String groupValue, Function(String) onChanged) {
    final isSelected = value == groupValue;
    return Expanded(
      child: InkWell(
        onTap: () => onChanged(value),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 12),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: isSelected ? const Color(0xFF4F46E5) : Colors.transparent,
            border: Border.all(color: isSelected ? Colors.transparent : Colors.grey.shade300),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Text(
            label,
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.bold,
              color: isSelected ? Colors.white : Colors.grey,
            ),
          ),
        ),
      ),
    );
  }

  // --- REUSABLE COVER SELECTOR ---
  Widget _buildCoverThemeSelector() {
    return SizedBox(
      height: 70,
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        itemCount: _coverPresets.length,
        itemBuilder: (context, index) {
          final preset = _coverPresets[index];
          final isSelected = _aiCoverUrl == preset['url'];
          return InkWell(
            onTap: () => setState(() => _aiCoverUrl = preset['url']!),
            child: Container(
              width: 100,
              margin: const EdgeInsets.only(right: 10),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: isSelected ? const Color(0xFF4F46E5) : Colors.transparent,
                  width: 2.0,
                ),
                image: DecorationImage(
                  image: NetworkImage(preset['url']!),
                  fit: BoxFit.cover,
                  colorFilter: ColorFilter.mode(
                    Colors.black.withOpacity(isSelected ? 0.3 : 0.5),
                    BlendMode.darken,
                  ),
                ),
              ),
              alignment: Alignment.center,
              child: Text(
                preset['label']!,
                style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold),
              ),
            ),
          );
        },
      ),
    );
  }
}
