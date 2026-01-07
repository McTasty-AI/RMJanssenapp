import { useState } from 'react';
import { Alert, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { InputField } from '~/components/InputField';
import { PrimaryButton } from '~/components/PrimaryButton';
import { useSupabase } from '~/hooks/useSupabase';

const leaveTypes = ['vakantie', 'atv', 'persoonlijk', 'onbetaald'] as const;

export default function LeaveScreen() {
  const { supabase, session } = useSupabase();
  const today = new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [type, setType] = useState<(typeof leaveTypes)[number]>('vakantie');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!session) {
      Alert.alert('Niet ingelogd', 'Log in om verlof aan te vragen.');
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.from('leave_requests').insert({
        user_id: session.user.id,
        start_date: startDate,
        end_date: endDate,
        type,
        reason: reason || null,
      });
      if (error) throw error;
      Alert.alert('Verzonden', 'Je verlofaanvraag is ingediend.');
    } catch (err: any) {
      Alert.alert('Verzoek mislukt', err?.message ?? 'Onbekende fout');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Verlof aanvragen</Text>
        <Text style={styles.subtitle}>Stuur je verzoek naar de administratie.</Text>

        <InputField label="Startdatum (YYYY-MM-DD)" value={startDate} onChangeText={setStartDate} />
        <InputField label="Einddatum (YYYY-MM-DD)" value={endDate} onChangeText={setEndDate} />
        <InputField
          label="Type (vakantie/atv/persoonlijk/onbetaald)"
          value={type}
          onChangeText={(val) => setType(val as any)}
          autoCapitalize="none"
        />
        <InputField label="Reden (optioneel)" value={reason} onChangeText={setReason} multiline numberOfLines={3} />

        <PrimaryButton title={submitting ? 'Versturen...' : 'Verstuur'} onPress={handleSubmit} disabled={submitting} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  scroll: {
    padding: 20,
    gap: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0f172a',
  },
  subtitle: {
    color: '#475569',
    marginBottom: 6,
  },
});






