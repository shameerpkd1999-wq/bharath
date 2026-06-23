import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:bharath_flutter/services/routing_service.dart';

String _decodeHex(String hex) {
  try {
    final List<int> bytes = [];
    for (int i = 0; i < hex.length; i += 2) {
      bytes.add(int.parse(hex.substring(i, i + 2), radix: 16));
    }
    return ascii.decode(bytes);
  } catch (_) {
    return '';
  }
}

Future<Map<String, dynamic>?> resolveKeylessMappls(String pin) async {
  try {
    final String url = 'https://mappls.com/$pin';
    final response = await http.get(
      Uri.parse(url),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
    );
    if (response.statusCode != 200) {
      return null;
    }

    final body = response.body;

    // 1. Extract place name
    final ogTitleReg = RegExp(r'<meta property="og:title" content="([^"]+)">');
    String placeName = ogTitleReg.firstMatch(body)?.group(1) ?? '';

    // 2. Extract address
    final ogDescReg = RegExp(r'<meta property="og:description" content="([^"]+)">');
    String address = ogDescReg.firstMatch(body)?.group(1) ?? '';

    if (placeName.isEmpty) {
      final titleReg = RegExp(r'<title>([^<]+)</title>');
      final title = titleReg.firstMatch(body)?.group(1) ?? '';
      if (title.isNotEmpty) {
        final parts = title.split(',');
        placeName = parts[0].trim();
        address = parts.skip(1).join(',').trim();
      }
    }

    // 3. Extract coordinates
    double? lat;
    double? lng;

    // Fallback A: addEditPlace(10.778867,76.473592,...)
    final RegExp editReg = RegExp(r'addEditPlace\(\s*(\d+\.\d+)\s*,\s*(\d+\.\d+)\s*,');
    final editMatch = editReg.firstMatch(body);
    if (editMatch != null) {
      lat = double.tryParse(editMatch.group(1)!);
      lng = double.tryParse(editMatch.group(2)!);
    }

    // Fallback B: Decoded still_image hex coordinates
    if (lat == null || lng == null) {
      final RegExp imgReg = RegExp(r'still_image_([a-zA-Z0-9_]+)\.png');
      final imgMatch = imgReg.firstMatch(body);
      if (imgMatch != null) {
        final parts = imgMatch.group(1)!.split('_');
        if (parts.length >= 2) {
          final latStr = _decodeHex(parts[0]);
          final lngStr = _decodeHex(parts[1]);
          lat = double.tryParse(latStr);
          lng = double.tryParse(lngStr);
        }
      }
    }

    // Fallback C: Any general coordinate pattern in script/tags
    if (lat == null || lng == null) {
      final RegExp genericReg = RegExp(r'(\d+\.\d+),(\d+\.\d+)');
      final genericMatch = genericReg.firstMatch(body);
      if (genericMatch != null) {
        lat = double.tryParse(genericMatch.group(1)!);
        lng = double.tryParse(genericMatch.group(2)!);
      }
    }

    if (lat != null && lng != null) {
      return {
        'placeName': placeName.isNotEmpty ? placeName : 'Mappls Pin Location',
        'address': address,
        'lat': lat,
        'lng': lng,
      };
    }
  } catch (e) {
    debugPrint('Keyless resolution error: $e');
  }
  return null;
}

void main() {
  test('Test Keyless Mappls Resolver', () async {
    final result = await resolveKeylessMappls('0mxcrz');
    expect(result, isNotNull);
    debugPrint('Keyless Result: $result');
  });

  test('Test RoutingService fetchPlaceFromPin', () async {
    final service = RoutingService();
    final result = await service.fetchPlaceFromPin('0mxcrz');
    expect(result, isNotNull);
    expect(result!['placeName'], 'Pattrippala');
    expect(result['lat'], 10.778867);
    expect(result['lng'], 76.473592);
    debugPrint('RoutingService Pin Result: $result');
  });
}
