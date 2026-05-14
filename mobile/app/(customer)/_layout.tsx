import { Tabs } from 'expo-router';
import { Colors, FontSize } from '../../constants/theme';
import { Text } from 'react-native';

function Icon({ label }: { label: string }) {
  return <Text style={{ fontSize: 20 }}>{label}</Text>;
}

export default function CustomerLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopColor: Colors.border,
          borderTopWidth: 1,
          paddingBottom: 4,
          height: 60,
        },
        tabBarLabelStyle: { fontSize: FontSize.xs, fontWeight: '700' },
        headerStyle: { backgroundColor: Colors.background },
        headerTintColor: Colors.primary,
        headerTitleStyle: { color: Colors.textPrimary, fontWeight: '700' },
        contentStyle: { backgroundColor: Colors.background },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Home', headerShown: false, tabBarIcon: () => <Icon label="🏠" /> }}
      />
      <Tabs.Screen
        name="bookings"
        options={{ title: 'Bookings', tabBarIcon: () => <Icon label="📋" /> }}
      />
      <Tabs.Screen
        name="disputes"
        options={{ title: 'Disputes', tabBarIcon: () => <Icon label="🚨" /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile', tabBarIcon: () => <Icon label="👤" /> }}
      />
    </Tabs>
  );
}
