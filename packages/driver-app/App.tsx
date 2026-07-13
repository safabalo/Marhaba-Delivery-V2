import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { tokenStore } from './src/lib/auth';
import { flushOutbox } from './src/lib/outbox';
import { connectSocket } from './src/lib/socket';
import { ActiveDeliveryScreen } from './src/screens/ActiveDeliveryScreen';
import { LoginScreen } from './src/screens/LoginScreen';

export type RootStackParamList = {
  Login: undefined;
  ActiveDelivery: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    tokenStore.getAccess().then((t) => {
      setSignedIn(!!t);
      setReady(true);
      if (t) void connectSocket();
    });

    // Drain the offline outbox periodically and on startup.
    const timer = setInterval(() => void flushOutbox(), 10_000);
    void flushOutbox();
    return () => clearInterval(timer);
  }, []);

  if (!ready) return null;

  return (
    <NavigationContainer>
      <StatusBar style="auto" />
      <Stack.Navigator>
        {signedIn ? (
          <Stack.Screen name="ActiveDelivery" options={{ title: 'Active delivery' }}>
            {() => <ActiveDeliveryScreen onSignOut={() => setSignedIn(false)} />}
          </Stack.Screen>
        ) : (
          <Stack.Screen name="Login" options={{ headerShown: false }}>
            {() => <LoginScreen onSignedIn={() => setSignedIn(true)} />}
          </Stack.Screen>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
