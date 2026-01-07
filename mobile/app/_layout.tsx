import { Stack } from 'expo-router';
import { ActivityIndicator, SafeAreaView } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SupabaseProvider } from '~/providers/SupabaseProvider';
import { useSupabase } from '~/hooks/useSupabase';
import { LoginScreen } from '~/screens/LoginScreen';

function AuthGate({ children }: { children: React.ReactNode }) {
  const { session, loading } = useSupabase();

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#0ea5e9" />
      </SafeAreaView>
    );
  }

  if (!session) {
    return <LoginScreen />;
  }

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <SupabaseProvider>
      <StatusBar style="dark" />
      <AuthGate>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
        </Stack>
      </AuthGate>
    </SupabaseProvider>
  );
}

