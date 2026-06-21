import 'package:cloud_firestore/cloud_firestore.dart';
import '../models/trip.dart';
import '../models/waypoint.dart';

class FirestoreService {
  final FirebaseFirestore _db = FirebaseFirestore.instance;

  // Save a new trip along with its waypoints
  Future<String> saveTrip(Trip trip, List<Waypoint> waypoints) async {
    try {
      // 1. Save trip document
      DocumentReference tripRef = await _db.collection('trips').add(trip.toMap());
      
      // 2. Save waypoints sequentially in the subcollection
      for (var wp in waypoints) {
        DocumentReference wpRef = tripRef.collection('waypoints').doc();
        var wpData = wp.toMap();
        wpData['id'] = wpRef.id; // Assign document ID
        await wpRef.set(wpData);
      }

      return tripRef.id;
    } catch (e) {
      rethrow;
    }
  }

  // Fetch all trips for a specific user
  Future<List<Trip>> getUserTrips(String userId) async {
    try {
      QuerySnapshot snapshot = await _db
          .collection('trips')
          .where('userId', isEqualTo: userId)
          .orderBy('createdAt', descending: true)
          .get();

      List<Trip> trips = [];
      for (var doc in snapshot.docs) {
        var data = doc.data() as Map<String, dynamic>;
        data['id'] = doc.id;

        // Fetch waypoints subcollection
        List<Waypoint> waypoints = await getTripWaypoints(doc.id);
        trips.add(Trip.fromMap(data, waypoints: waypoints));
      }
      return trips;
    } catch (e) {
      rethrow;
    }
  }

  // Fetch all public trips for the explore feed
  Future<List<Trip>> getPublicTrips() async {
    try {
      QuerySnapshot snapshot = await _db
          .collection('trips')
          .where('isPublic', isEqualTo: true)
          .orderBy('createdAt', descending: true)
          .get();

      List<Trip> trips = [];
      for (var doc in snapshot.docs) {
        var data = doc.data() as Map<String, dynamic>;
        data['id'] = doc.id;

        List<Waypoint> waypoints = await getTripWaypoints(doc.id);
        trips.add(Trip.fromMap(data, waypoints: waypoints));
      }
      return trips;
    } catch (e) {
      rethrow;
    }
  }

  // Get waypoints for a specific trip
  Future<List<Waypoint>> getTripWaypoints(String tripId) async {
    try {
      QuerySnapshot snapshot = await _db
          .collection('trips')
          .doc(tripId)
          .collection('waypoints')
          .orderBy('order')
          .get();

      return snapshot.docs.map((doc) {
        var data = doc.data() as Map<String, dynamic>;
        data['id'] = doc.id;
        return Waypoint.fromMap(data);
      }).toList();
    } catch (e) {
      rethrow;
    }
  }

  // Clone a trip for another user
  Future<String> cloneTrip(Trip originalTrip, String newUserId, String newUserName) async {
    try {
      Trip clonedTrip = Trip(
        id: '',
        userId: newUserId,
        userName: newUserName,
        title: '${originalTrip.title} (Clone)',
        isPublic: false,
        sourceText: originalTrip.sourceText,
        createdAt: DateTime.now().toIso8601String(),
        coverUrl: originalTrip.coverUrl,
        isMock: originalTrip.isMock,
        geminiError: originalTrip.geminiError,
      );

      return await saveTrip(clonedTrip, originalTrip.waypoints);
    } catch (e) {
      rethrow;
    }
  }

  // Delete a trip and its waypoints
  Future<void> deleteTrip(String tripId) async {
    try {
      // 1. Delete all waypoints in the subcollection first
      var wps = await _db.collection('trips').doc(tripId).collection('waypoints').get();
      for (var doc in wps.docs) {
        await doc.reference.delete();
      }

      // 2. Delete the parent trip doc
      await _db.collection('trips').doc(tripId).delete();
    } catch (e) {
      rethrow;
    }
  }
}
