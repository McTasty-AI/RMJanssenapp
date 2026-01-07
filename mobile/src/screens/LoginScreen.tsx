import { useState } from 'react';
import { Alert, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { InputField } from '~/components/InputField';
import { PrimaryButton } from '~/components/PrimaryButton';
import { useSupabase } from '~/hooks/useSupabase';

export function LoginScreen() {
  const { supabase } = useSupabase();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!email || !password) {
      Alert.alert('Inloggen', 'Vul je e-mail en wachtwoord in.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (error) {
      Alert.alert('Inloggen mislukt', error.message);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>RM Janssen Chauffeur</Text>
      <Text style={styles.subtitle}>Log in om je gegevens in te dienen.</Text>

      <InputField
        label="E-mail"
        placeholder="jij@bedrijf.nl"
        keyboardType="email-address"
        autoCapitalize="none"
        value={email}
        onChangeText={setEmail}
      />
      <InputField
        label="Wachtwoord"
        placeholder="********"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      <PrimaryButton title={loading ? 'Bezig...' : 'Log in'} onPress={handleLogin} disabled={loading} />

      <Text style={styles.hint}>
        Heb je nog geen account? Vraag een beheerder om je uit te nodigen in Supabase/Auth.
      </Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f8fafc',
    gap: 16,
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0f172a',
  },
  subtitle: {
    color: '#475569',
    marginBottom: 10,
  },
  hint: {
    marginTop: 18,
    color: '#6b7280',
    fontSize: 12,
    lineHeight: 17,
  },
});






