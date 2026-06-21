import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/auth_service.dart';

class AuthScreen extends StatefulWidget {
  const AuthScreen({super.key});

  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  final _formKey = GlobalKey<FormState>();
  bool _isLogin = true;
  String _name = '';
  String _email = '';
  String _password = '';
  String _error = '';
  bool _actionLoading = false;

  void _submit() async {
    if (!_formKey.currentState!.validate()) return;
    _formKey.currentState!.save();
    
    setState(() {
      _error = '';
      _actionLoading = true;
    });

    final auth = Provider.of<AuthService>(context, listen: false);
    try {
      if (_isLogin) {
        await auth.login(_email, _password);
      } else {
        await auth.signUp(_email, _password, _name);
      }
    } catch (e) {
      setState(() {
        _error = e.toString().replaceAll(RegExp(r'\[.*\]'), '').trim();
      });
    } finally {
      if (mounted) {
        setState(() {
          _actionLoading = false;
        });
      }
    }
  }

  void _submitGoogle() async {
    setState(() {
      _error = '';
      _actionLoading = true;
    });

    final auth = Provider.of<AuthService>(context, listen: false);
    try {
      await auth.loginWithGoogle();
    } catch (e) {
      setState(() {
        _error = e.toString().replaceAll(RegExp(r'\[.*\]'), '').trim();
      });
    } finally {
      if (mounted) {
        setState(() {
          _actionLoading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final primaryColor = isDark ? const Color(0xFF818CF8) : const Color(0xFF4F46E5);

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24.0),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                // Logo & Header
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                      colors: [Color(0xFF4F46E5), Color(0xFF6366F1)],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                    borderRadius: BorderRadius.circular(20),
                    boxShadow: const [
                      BoxShadow(
                        color: Colors.black12,
                        blurRadius: 8,
                        offset: Offset(0, 4),
                      )
                    ],
                  ),
                  child: const Icon(
                    Icons.compass_calibration,
                    size: 32,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 16),
                const Text(
                  'BharatYatra',
                  style: TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.black,
                    letterSpacing: -0.5,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  'AI INDIA TRAVEL PLANNER',
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.bold,
                    letterSpacing: 1.5,
                    color: isDark ? Colors.white54 : Colors.black45,
                  ),
                ),
                const SizedBox(height: 32),

                // Auth Card
                Container(
                  padding: const EdgeInsets.all(24),
                  decoration: BoxDecoration(
                    color: isDark ? const Color(0xFF0F172A) : Colors.white,
                    borderRadius: BorderRadius.circular(28),
                    border: Border.all(
                      color: isDark ? const Color(0xFF1E293B) : const Color(0xFFF1F5F9),
                    ),
                  ),
                  child: Form(
                    key: _formKey,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        // Toggle Slider
                        Container(
                          padding: const EdgeInsets.all(4),
                          decoration: BoxDecoration(
                            color: isDark ? const Color(0xFF1E293B) : const Color(0xFFF1F5F9),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Row(
                            children: [
                              Expanded(
                                child: InkWell(
                                  onTap: () => setState(() {
                                    _isLogin = true;
                                    _error = '';
                                  }),
                                  child: Container(
                                    padding: const EdgeInsets.symmetric(vertical: 8),
                                    alignment: Alignment.center,
                                    decoration: BoxDecoration(
                                      color: _isLogin
                                          ? (isDark ? const Color(0xFF334155) : Colors.white)
                                          : Colors.transparent,
                                      borderRadius: BorderRadius.circular(8),
                                      boxShadow: _isLogin
                                          ? const [BoxShadow(color: Colors.black12, blurRadius: 2)]
                                          : null,
                                    ),
                                    child: Text(
                                      'Login',
                                      style: TextStyle(
                                        fontSize: 12,
                                        fontWeight: FontWeight.bold,
                                        color: _isLogin ? primaryColor : Colors.grey,
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                              Expanded(
                                child: InkWell(
                                  onTap: () => setState(() {
                                    _isLogin = false;
                                    _error = '';
                                  }),
                                  child: Container(
                                    padding: const EdgeInsets.symmetric(vertical: 8),
                                    alignment: Alignment.center,
                                    decoration: BoxDecoration(
                                      color: !_isLogin
                                          ? (isDark ? const Color(0xFF334155) : Colors.white)
                                          : Colors.transparent,
                                      borderRadius: BorderRadius.circular(8),
                                      boxShadow: !_isLogin
                                          ? const [BoxShadow(color: Colors.black12, blurRadius: 2)]
                                          : null,
                                    ),
                                    child: Text(
                                      'Sign Up',
                                      style: TextStyle(
                                        fontSize: 12,
                                        fontWeight: FontWeight.bold,
                                        color: !_isLogin ? primaryColor : Colors.grey,
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 20),

                        // Error Alerts
                        if (_error.isNotEmpty) ...[
                          Container(
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: Colors.red.withOpacity(0.08),
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(color: Colors.red.withOpacity(0.2)),
                            ),
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Icon(Icons.error_outline, size: 16, color: Colors.red),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: Text(
                                    _error,
                                    style: const TextStyle(
                                      fontSize: 11,
                                      color: Colors.red,
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 16),
                        ],

                        // Name Field (only during sign up)
                        if (!_isLogin) ...[
                          TextFormField(
                            decoration: InputDecoration(
                              labelText: 'NAME',
                              labelStyle: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 1.0),
                              prefixIcon: const Icon(Icons.person_outline, size: 18),
                              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                            ),
                            validator: (val) => val == null || val.trim().isEmpty ? 'Enter your name' : null,
                            onSaved: (val) => _name = val!.trim(),
                          ),
                          const SizedBox(height: 16),
                        ],

                        // Email Field
                        TextFormField(
                          keyboardType: TextInputType.emailAddress,
                          decoration: InputDecoration(
                            labelText: 'EMAIL',
                            labelStyle: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 1.0),
                            prefixIcon: const Icon(Icons.mail_outline, size: 18),
                            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                          ),
                          validator: (val) => val == null || !val.contains('@') ? 'Enter a valid email' : null,
                          onSaved: (val) => _email = val!.trim(),
                        ),
                        const SizedBox(height: 16),

                        // Password Field
                        TextFormField(
                          obscureText: true,
                          decoration: InputDecoration(
                            labelText: 'PASSWORD',
                            labelStyle: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 1.0),
                            prefixIcon: const Icon(Icons.lock_outline, size: 18),
                            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                          ),
                          validator: (val) => val == null || val.length < 6 ? 'Password must be 6+ chars' : null,
                          onSaved: (val) => _password = val!.trim(),
                        ),
                        const SizedBox(height: 24),

                        // Submit Button
                        ElevatedButton(
                          onPressed: _actionLoading ? null : _submit,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFF4F46E5),
                            foregroundColor: Colors.white,
                            padding: const EdgeInsets.symmetric(vertical: 14),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                            elevation: 0,
                          ),
                          child: _actionLoading
                              ? const SizedBox(
                                  height: 20,
                                  width: 20,
                                  child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                                )
                              : Text(
                                  _isLogin ? 'Sign In' : 'Create Account',
                                  style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                                ),
                        ),
                        const SizedBox(height: 20),

                        // Divider
                        Row(
                          children: [
                            Expanded(child: Divider(color: isDark ? Colors.white10 : Colors.black12)),
                            Padding(
                              padding: const EdgeInsets.symmetric(horizontal: 10),
                              child: Text(
                                'OR',
                                style: TextStyle(
                                  fontSize: 9,
                                  fontWeight: FontWeight.bold,
                                  color: isDark ? Colors.white38 : Colors.black38,
                                ),
                              ),
                            ),
                            Expanded(child: Divider(color: isDark ? Colors.white10 : Colors.black12)),
                          ],
                        ),
                        const SizedBox(height: 20),

                        // Google Sign In Button
                        OutlinedButton.icon(
                          onPressed: _actionLoading ? null : _submitGoogle,
                          icon: Image.network(
                            'https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg',
                            height: 18,
                            width: 18,
                            errorBuilder: (context, error, stackTrace) => const Icon(Icons.g_mobiledata, size: 24),
                          ),
                          label: Text(
                            'Sign In with Google',
                            style: TextStyle(
                              fontWeight: FontWeight.bold,
                              fontSize: 12,
                              color: isDark ? Colors.white87 : Colors.black87,
                            ),
                          ),
                          style: OutlinedButton.styleFrom(
                            padding: const EdgeInsets.symmetric(vertical: 12),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                            side: BorderSide(
                              color: isDark ? const Color(0xFF1E293B) : const Color(0xFFE2E8F0),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
