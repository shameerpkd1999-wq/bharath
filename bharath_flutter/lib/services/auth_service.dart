import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:google_sign_in/google_sign_in.dart';

class AuthService extends ChangeNotifier {
  final FirebaseAuth _auth = FirebaseAuth.instance;
  final GoogleSignIn _googleSignIn = GoogleSignIn();

  User? _user;
  bool _loading = true;

  User? get user => _user;
  bool get loading => _loading;

  AuthService() {
    _auth.authStateChanges().listen((User? user) {
      _user = user;
      _loading = false;
      notifyListeners();
    });
  }

  // Sign Up with Email and Password
  Future<UserCredential> signUp(String email, String password, String name) async {
    try {
      UserCredential credential = await _auth.createUserWithEmailAndPassword(
        email: email,
        password: password,
      );
      
      // Update Display Name
      if (credential.user != null) {
        await credential.user!.updateDisplayName(name);
        await credential.user!.reload();
        _user = _auth.currentUser;
        notifyListeners();
      }
      return credential;
    } catch (e) {
      rethrow;
    }
  }

  // Login with Email and Password
  Future<UserCredential> login(String email, String password) async {
    try {
      return await _auth.signInWithEmailAndPassword(
        email: email,
        password: password,
      );
    } catch (e) {
      rethrow;
    }
  }

  // Google Sign In
  Future<UserCredential?> loginWithGoogle() async {
    try {
      final GoogleSignInAccount? googleUser = await _googleSignIn.signIn();
      if (googleUser == null) return null; // user cancelled

      final GoogleSignInAuthentication googleAuth = await googleUser.authentication;
      final AuthCredential credential = GoogleAuthProvider.credential(
        accessToken: googleAuth.accessToken,
        idToken: googleAuth.idToken,
      );

      return await _auth.signInWithCredential(credential);
    } catch (e) {
      rethrow;
    }
  }

  // Logout
  Future<void> logout() async {
    await _googleSignIn.signOut();
    await _auth.signOut();
  }
}
