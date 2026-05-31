import { Tabs } from 'expo-router';
import { Colors, FontSize, FontWeight } from '../../constants/theme';

export default function CustomerLayout() {
  return (
    <Tabs
      tabBar={() => null}
      screenOptions={{
        headerStyle: { backgroundColor: Colors.primary, shadowColor: 'transparent', elevation: 0 },
        headerTintColor: Colors.textInverse,
        headerTitleStyle: { color: Colors.textInverse, fontWeight: FontWeight.bold, fontSize: FontSize.lg },
        contentStyle: { backgroundColor: Colors.background },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Services', headerShown: false }}
      />
      <Tabs.Screen
        name="bookings"
        options={{ headerShown: false }}
      />
      <Tabs.Screen
        name="disputes"
        options={{ headerShown: false }}
      />
      <Tabs.Screen
        name="profile"
        options={{ headerShown: false }}
      />
    </Tabs>
  );
}
