import 'package:flutter_test/flutter_test.dart';

import 'package:sonora/main.dart';

void main() {
  testWidgets('splash shows SONORA', (WidgetTester tester) async {
    await tester.pumpWidget(const SonoraApp());
    expect(find.text('SONORA'), findsOneWidget);
  });
}