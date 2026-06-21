import 'waypoint.dart';

class Trip {
  final String id;
  final String userId;
  final String userName;
  final String title;
  final bool isPublic;
  final String sourceText;
  final String createdAt;
  final String? coverUrl;
  final bool isMock;
  final String? geminiError;
  final List<Waypoint> waypoints;

  Trip({
    required this.id,
    required this.userId,
    required this.userName,
    required this.title,
    required this.isPublic,
    required this.sourceText,
    required this.createdAt,
    this.coverUrl,
    this.isMock = false,
    this.geminiError,
    this.waypoints = const [],
  });

  factory Trip.fromMap(Map<String, dynamic> data, {List<Waypoint> waypoints = const []}) {
    return Trip(
      id: data['id'] ?? '',
      userId: data['userId'] ?? '',
      userName: data['userName'] ?? '',
      title: data['title'] ?? '',
      isPublic: data['isPublic'] ?? false,
      sourceText: data['sourceText'] ?? '',
      createdAt: data['createdAt'] ?? '',
      coverUrl: data['coverUrl'],
      isMock: data['isMock'] ?? false,
      geminiError: data['geminiError'],
      waypoints: waypoints,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'userId': userId,
      'userName': userName,
      'title': title,
      'isPublic': isPublic,
      'sourceText': sourceText,
      'createdAt': createdAt,
      'coverUrl': coverUrl,
      'isMock': isMock,
      'geminiError': geminiError,
    };
  }
}
