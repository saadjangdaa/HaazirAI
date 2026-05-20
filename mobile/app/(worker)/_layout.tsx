import { Tabs } from 'expo-router';
import { Colors, FontSize, FontWeight } from '../../constants/theme';
import FloatingTabBar from '../../components/FloatingTabBar';

export default function WorkerLayout() {
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
        name="jobs"
        options={{ title: 'Jobs', headerShown: false }}
      />
      <Tabs.Screen
        name="earnings"
        options={{ title: 'Earnings', headerShown: false }}
      />
      <Tabs.Screen
        name="route"
        options={{ title: 'Route' }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile' }}
      />
    </Tabs>
  );
}
