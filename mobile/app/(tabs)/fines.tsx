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

export default function FinesScreen() {
  const { supabase, session } = useSupabase();
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [licensePlate, setLicensePlate] = useState('');
  const [paidByDriver, setPaidByDriver] = useState(false);
  const [receipt, setReceipt] = useState<PickedFile | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function pickReceipt() {
    const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
    if (res.canceled || !res.assets?.length) return;
    const asset = res.assets[0];
    setReceipt({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType });
  }

  async function handleSubmit() {
    if (!session) {
      Alert.alert('Niet ingelogd', 'Log in om een boete te registreren.');
      return;
    }
    if (!amount) {
      Alert.alert('Bedrag ontbreekt', 'Vul een bedrag in.');
      return;
    }

    setSubmitting(true);
    try {
      let receiptPath: string | null = null;
      if (receipt) {
        receiptPath = await uploadFromUri({
          bucket: 'receipts',
          uri: receipt.uri,
          originalName: receipt.name ?? 'boete',
          userId: session.user.id,
        });
      }

      const { error } = await supabase.from('fines').insert({
        user_id: session.user.id,
        date,
        amount: Number(amount),
        reason: reason || null,
        license_plate: licensePlate || null,
        paid_by: paidByDriver ? 'driver' : 'company',
        receipt_path: receiptPath,
      });

      if (error) throw error;
      Alert.alert('Verzonden', 'Boete opgeslagen.');
      setReason('');
      setAmount('');
      setLicensePlate('');
      setReceipt(null);
    } catch (err: any) {
      Alert.alert('Opslaan mislukt', err?.message ?? 'Onbekende fout');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Boete melden</Text>
        <Text style={styles.subtitle}>Voeg optioneel een scan van de boete toe.</Text>

        <InputField label="Datum (YYYY-MM-DD)" value={date} onChangeText={setDate} />
        <InputField label="Bedrag (€)" value={amount} onChangeText={setAmount} keyboardType="numeric" />
        <InputField label="Kenteken" value={licensePlate} onChangeText={setLicensePlate} autoCapitalize="characters" />
        <InputField label="Omschrijving (optioneel)" value={reason} onChangeText={setReason} multiline numberOfLines={3} />

        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Betaald door chauffeur</Text>
          <Switch value={paidByDriver} onValueChange={setPaidByDriver} />
        </View>

        <PrimaryButton title={receipt ? 'Andere bijlage' : 'Voeg boete-bijlage toe'} onPress={pickReceipt} />
        {receipt ? <Text style={styles.fileLabel}>Gekozen: {receipt.name ?? receipt.uri}</Text> : null}

        <PrimaryButton title={submitting ? 'Opslaan...' : 'Opslaan'} onPress={handleSubmit} disabled={submitting} />
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






