class RouteStep {
  final String instruction;
  final double distanceMeters;
  final double durationSeconds;
  final String type;
  final String? modifier;

  RouteStep({
    required this.instruction,
    required this.distanceMeters,
    required this.durationSeconds,
    required this.type,
    this.modifier,
  });
}
