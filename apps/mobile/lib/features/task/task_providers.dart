import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import 'task_api.dart';

final taskApiProvider = Provider<TaskApi>((ref) => TaskApi(ref.watch(apiClientProvider)));
