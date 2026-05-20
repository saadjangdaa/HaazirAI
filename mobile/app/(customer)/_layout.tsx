import { Tabs } from 'expo-router';
import { Colors, FontSize, FontWeight } from '../../constants/theme';
import { Platform } from 'react-native';
import FloatingTabBar from '../../components/FloatingTabBar';

export default function CustomerLayout() {
  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
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
        options={{ title: 'Orders' }}
      />
      <Tabs.Screen
        name="disputes"
        options={{ title: 'Disputes' }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile' }}
      />
    </Tabs>
  );
}
