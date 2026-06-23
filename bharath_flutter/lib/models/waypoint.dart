class Waypoint {
  final String id;
  final String placeName;
  final int order;
  final int durationMin;
  final List<String> foodSpots;
  final List<String> photoPoints;
  final double lat;
  final double lng;

  Waypoint({
    required this.id,
    required this.placeName,
    required this.order,
    required this.durationMin,
    required this.foodSpots,
    required this.photoPoints,
    required this.lat,
    required this.lng,
  });

  factory Waypoint.fromMap(Map<String, dynamic> data) {
    return Waypoint(
      id: data['id'] ?? '',
      placeName: data['placeName'] ?? '',
      order: data['order'] ?? 0,
      durationMin: data['durationMin'] ?? 0,
      foodSpots: List<String>.from(data['foodSpots'] ?? []),
      photoPoints: List<String>.from(data['photoPoints'] ?? []),
      lat: (data['lat'] as num?)?.toDouble() ?? 0.0,
      lng: (data['lng'] as num?)?.toDouble() ?? 0.0,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'placeName': placeName,
      'order': order,
      'durationMin': durationMin,
      'foodSpots': foodSpots,
      'photoPoints': photoPoints,
      'lat': lat,
      'lng': lng,
    };
  }

  Waypoint copyWith({
    String? id,
    String? placeName,
    int? order,
    int? durationMin,
    List<String>? foodSpots,
    List<String>? photoPoints,
    double? lat,
    double? lng,
  }) {
    return Waypoint(
      id: id ?? this.id,
      placeName: placeName ?? this.placeName,
      order: order ?? this.order,
      durationMin: durationMin ?? this.durationMin,
      foodSpots: foodSpots ?? this.foodSpots,
      photoPoints: photoPoints ?? this.photoPoints,
      lat: lat ?? this.lat,
      lng: lng ?? this.lng,
    );
  }
}
