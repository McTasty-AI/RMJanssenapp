import { useState } from 'react';
import { Alert, SafeAreaView, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { InputField } from '~/components/InputField';
import { PrimaryButton } from '~/components/PrimaryButton';
import { useSupabase } from '~/hooks/useSupabase';
import { uploadFromUri } from '~/lib/storage';

type PickedFile = {
  uri: string;
  name?: string;
  mimeType?: string | null;
};

export default function DeclarationsScreen() {
  const { supabase, session } = useSupabase();
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [isToll, setIsToll] = useState(false);
  const [receipt, setReceipt] = useState<PickedFile | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function pickReceipt() {
    const res = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (res.canceled || !res.assets?.length) return;
    const asset = res.assets[0];
    setReceipt({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType });
  }

  async function handleSubmit() {
    if (!session) {
      Alert.alert('Niet ingelogd', 'Log in om een declaratie in te dienen.');
      return;
    }
    if (!receipt) {
      Alert.alert('Bon ontbreekt', 'Kies een bon / foto van je declaratie.');
      return;
    }
    if (!amount) {
      Alert.alert('Bedrag ontbreekt', 'Vul een bedrag in.');
      return;
    }

    setSubmitting(true);
    try {
      const receiptPath = await uploadFromUri({
        bucket: 'receipts',
        uri: receipt.uri,
        originalName: receipt.name ?? 'bon',
        userId: session.user.id,
      });

      const { error } = await supabase.from('declarations').insert({
        user_id: session.user.id,
        date,
        amount: Number(amount),
        reason,
        receipt_path: receiptPath,
        is_toll: isToll,
      });

      if (error) throw error;
      Alert.alert('Verzonden', 'Je declaratie is ingestuurd.');
      setReason('');
      setAmount('');
      setReceipt(null);
    } catch (err: any) {
      Alert.alert('Declaratie mislukt', err?.message ?? 'Onbekende fout');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Declaratie indienen</Text>
        <Text style={styles.subtitle}>Upload een bon en stuur direct naar Supabase.</Text>

        <InputField label="Datum (YYYY-MM-DD)" value={date} onChangeText={setDate} />
        <InputField label="Bedrag (€)" value={amount} onChangeText={setAmount} keyboardType="numeric" />
        <InputField label="Omschrijving" value={reason} onChangeText={setReason} multiline numberOfLines={3} />

        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Tol/wegvergoeding</Text>
          <Switch value={isToll} onValueChange={setIsToll} />
        </View>

        <PrimaryButton title={receipt ? 'Andere bon kiezen' : 'Kies bon / foto'} onPress={pickReceipt} />
        {receipt ? <Text style={styles.fileLabel}>Gekozen: {receipt.name ?? receipt.uri}</Text> : null}

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
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  switchLabel: {
    fontWeight: '600',
    color: '#0f172a',
  },
  fileLabel: {
    color: '#334155',
    fontSize: 12,
  },
});






