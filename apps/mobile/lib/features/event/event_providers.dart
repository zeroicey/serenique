import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import 'event_api.dart';

final eventApiProvider = Provider<EventApi>((ref) => EventApi(ref.watch(apiClientProvider)));
