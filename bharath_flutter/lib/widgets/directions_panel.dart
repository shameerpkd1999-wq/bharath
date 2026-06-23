import 'package:flutter/material.dart';
import '../models/route_step.dart';

class DirectionsPanel extends StatelessWidget {
  final List<RouteStep> steps;

  const DirectionsPanel({
    super.key,
    required this.steps,
  });

  @override
  Widget build(BuildContext context) {
    if (steps.isEmpty) return const SizedBox.shrink();
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1E293B) : Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: isDark ? const Color(0xFF334155) : const Color(0xFFF1F5F9),
        ),
        boxShadow: const [
          BoxShadow(
            color: Colors.black12,
            blurRadius: 10,
            offset: Offset(0, 4),
          )
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  Icon(
                    Icons.navigation,
                    size: 16,
                    color: isDark ? const Color(0xFF818CF8) : const Color(0xFF4F46E5),
                  ),
                  const SizedBox(width: 6),
                  Text(
                    'LIVE DIRECTIONS',
                    style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 1.2,
                      color: isDark ? Colors.white60 : Colors.black54,
                    ),
                  ),
                ],
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  color: (isDark ? const Color(0xFF818CF8) : const Color(0xFF4F46E5)).withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  '${steps.length} Steps',
                  style: TextStyle(
                    fontSize: 9,
                    fontWeight: FontWeight.w800,
                    color: isDark ? const Color(0xFF818CF8) : const Color(0xFF4F46E5),
                  ),
                ),
              ),
            ],
          ),
          const Divider(height: 20),
          Flexible(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxHeight: 180),
              child: ListView.separated(
                shrinkWrap: true,
                itemCount: steps.length,
                separatorBuilder: (context, index) => const Divider(height: 16, color: Colors.transparent),
                itemBuilder: (context, index) {
                  final step = steps[index];
                  return _buildStepRow(context, step);
                },
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStepRow(BuildContext context, RouteStep step) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    
    // Select icon
    IconData iconData = Icons.arrow_forward;
    Color iconColor = isDark ? const Color(0xFF818CF8) : const Color(0xFF4F46E5);

    final type = step.type.toLowerCase();
    final modifier = step.modifier?.toLowerCase() ?? '';

    if (type == 'depart') {
      iconData = Icons.play_circle_fill;
      iconColor = Colors.green;
    } else if (type == 'arrive') {
      iconData = Icons.flag;
      iconColor = Colors.red;
    } else if (modifier.contains('left')) {
      iconData = Icons.turn_left;
    } else if (modifier.contains('right')) {
      iconData = Icons.turn_right;
    } else if (modifier == 'straight') {
      iconData = Icons.arrow_upward;
    } else if (type == 'roundabout') {
      iconData = Icons.loop;
    }

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(
          iconData,
          size: 18,
          color: iconColor,
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                step.instruction,
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.bold,
                  color: isDark ? const Color(0xFFE2E8F0) : const Color(0xFF334155),
                  height: 1.3,
                ),
              ),
              if (step.distanceMeters > 0)
                Padding(
                  padding: const EdgeInsets.only(top: 2),
                  child: Text(
                    step.distanceMeters >= 1000
                        ? '${(step.distanceMeters / 1000).toStringAsFixed(1)} km'
                        : '${step.distanceMeters.round()} m',
                    style: const TextStyle(
                      fontSize: 9,
                      fontWeight: FontWeight.w800,
                      color: Colors.grey,
                    ),
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}
