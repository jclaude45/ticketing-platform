import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../core/constants/colors.dart';
import '../../core/network/network_info.dart';

class ConnectivityBanner extends ConsumerStatefulWidget {
  const ConnectivityBanner({super.key});

  @override
  ConsumerState<ConnectivityBanner> createState() =>
      _ConnectivityBannerState();
}

class _ConnectivityBannerState extends ConsumerState<ConnectivityBanner>
    with SingleTickerProviderStateMixin {
  late AnimationController _animationController;
  late Animation<double> _heightAnimation;
  bool _isVisible = false;
  bool? _previouslyOnline;

  @override
  void initState() {
    super.initState();
    _animationController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 300),
    );
    _heightAnimation = Tween<double>(begin: 0, end: 40).animate(
      CurvedAnimation(
          parent: _animationController, curve: Curves.easeOutCubic),
    );
  }

  @override
  void dispose() {
    _animationController.dispose();
    super.dispose();
  }

  void _updateVisibility(bool isOnline) {
    if (_previouslyOnline == null) {
      _previouslyOnline = isOnline;
      if (!isOnline) {
        _show();
      }
      return;
    }

    if (isOnline && _previouslyOnline == false) {
      // Just came back online — briefly show "back online"
      _previouslyOnline = isOnline;
      _show();
      Future.delayed(const Duration(seconds: 2), _hide);
    } else if (!isOnline && _previouslyOnline == true) {
      // Just went offline
      _previouslyOnline = isOnline;
      _show();
    }
  }

  void _show() {
    setState(() => _isVisible = true);
    _animationController.forward();
  }

  void _hide() {
    _animationController.reverse().then((_) {
      if (mounted) setState(() => _isVisible = false);
    });
  }

  @override
  Widget build(BuildContext context) {
    final connectivity = ref.watch(connectivityStreamProvider);

    return connectivity.when(
      data: (isOnline) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) _updateVisibility(isOnline);
        });

        if (!_isVisible) return const SizedBox.shrink();

        return AnimatedBuilder(
          animation: _heightAnimation,
          builder: (_, __) => SizedBox(
            height: _heightAnimation.value,
            child: Container(
              color:
                  isOnline ? AppColors.statusOnline : AppColors.statusOffline,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    isOnline ? Icons.wifi_rounded : Icons.wifi_off_rounded,
                    size: 14,
                    color: Colors.white,
                  ),
                  const SizedBox(width: 8),
                  Text(
                    isOnline
                        ? 'Back online – syncing...'
                        : 'You are offline – working in offline mode',
                    style: GoogleFonts.inter(
                      fontSize: 12,
                      color: Colors.white,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
      loading: () => const SizedBox.shrink(),
      error: (_, __) => const SizedBox.shrink(),
    );
  }
}
