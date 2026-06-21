import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'screens/auth_screen.dart';
import 'screens/create_trip_screen.dart';
import 'screens/explore_screen.dart';
import 'screens/my_trips_screen.dart';
import 'screens/profile_screen.dart';
import 'services/auth_service.dart';
import 'widgets/bottom_nav.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  
  // Note: Local Firebase initialization on mobile.
  // In production, configure Google Services for Android/iOS.
  try {
    await Firebase.initializeApp();
  } catch (e) {
    print('Firebase initialization failed: $e. Make sure config files are set up.');
  }

  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => AuthService()),
      ],
      child: MaterialApp(
        title: 'BharatYatra',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(
          useMaterial3: true,
          brightness: Brightness.light,
          primaryColor: const Color(0xFF4F46E5),
          scaffoldBackgroundColor: const Color(0xFFF8FAFC),
          colorScheme: const ColorScheme.light(
            primary: Color(0xFF4F46E5),
            secondary: Color(0xFF818CF8),
            surface: Colors.white,
          ),
          fontFamily: 'Roboto',
        ),
        darkTheme: ThemeData(
          useMaterial3: true,
          brightness: Brightness.dark,
          primaryColor: const Color(0xFF818CF8),
          scaffoldBackgroundColor: const Color(0xFF020617),
          colorScheme: const ColorScheme.dark(
            primary: Color(0xFF818CF8),
            secondary: Color(0xFF4F46E5),
            surface: Color(0xFF0F172A),
          ),
          fontFamily: 'Roboto',
        ),
        themeMode: ThemeMode.system, // Match device system theme
        home: const AuthGate(),
      ),
    );
  }
}

// Routes users based on authentication status
class AuthGate extends StatelessWidget {
  const AuthGate({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = Provider.of<AuthService>(context);

    if (auth.loading) {
      return const Scaffold(
        body: Center(
          child: CircularProgressIndicator(color: Color(0xFF4F46E5)),
        ),
      );
    }

    if (auth.user == null) {
      return const AuthScreen();
    }

    return const MainLayoutScreen();
  }
}

// Shell holding the bottom nav tabs
class MainLayoutScreen extends StatefulWidget {
  const MainLayoutScreen({super.key});

  @override
  State<MainLayoutScreen> createState() => _MainLayoutScreenState();
}

class _MainLayoutScreenState extends State<MainLayoutScreen> {
  int _currentIndex = 0;

  final List<Widget> _screens = const [
    ExploreScreen(),
    CreateTripScreen(),
    MyTripsScreen(),
    ProfileScreen(),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(
        index: _currentIndex,
        children: _screens,
      ),
      bottomNavigationBar: CustomBottomNav(
        currentIndex: _currentIndex,
        onTap: (index) {
          setState(() {
            _currentIndex = index;
          });
        },
      ),
    );
  }
}
