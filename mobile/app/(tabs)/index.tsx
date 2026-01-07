import { useState } from 'react';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from '~/components/PrimaryButton';
import { useSupabase } from '~/hooks/useSupabase';

export default function HomeScreen() {
  const { supabase, session } = useSupabase();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    await supabase.auth.signOut();
    setLoading(false);
  }

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Welkom</Text>
      <Text style={styles.subtitle}>
        Ingelogd als {session?.user.email ?? 'onbekend'}.
        {'\n'}Kies een tab om uren, verlof, declaraties, boetes of schades te melden.
      </Text>

      <View style={{ marginTop: 12 }}>
        <PrimaryButton title={loading ? 'Uitloggen...' : 'Uitloggen'} onPress={handleLogout} disabled={loading} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f8fafc',
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0f172a',
  },
  subtitle: {
    color: '#475569',
    lineHeight: 20,
  },
});






