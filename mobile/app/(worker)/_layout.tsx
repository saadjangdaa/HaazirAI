import { Tabs } from 'expo-router';
import { Colors, FontSize } from '../../constants/theme';
import { Text } from 'react-native';

function Icon({ label }: { label: string }) {
  return <Text style={{ fontSize: 20 }}>{label}</Text>;
}

export default function WorkerLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors.warning,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopColor: Colors.border,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: { fontSize: FontSize.xs, fontWeight: '700' },
        headerStyle: { backgroundColor: Colors.background },
        headerTintColor: Colors.warning,
        headerTitleStyle: { color: Colors.textPrimary, fontWeight: '700' },
        contentStyle: { backgroundColor: Colors.background },
      }}
    >
      <Tabs.Screen
        name="jobs"
        options={{ title: 'Jobs', tabBarIcon: () => <Icon label="💼" /> }}
      />
      <Tabs.Screen
        name="earnings"
        options={{ title: 'Kamai', tabBarIcon: () => <Icon label="💰" /> }}
      />
      <Tabs.Screen
        name="route"
        options={{ title: 'Route', tabBarIcon: () => <Icon label="🗺️" /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile', tabBarIcon: () => <Icon label="👷" /> }}
      />
    </Tabs>
  );
}
