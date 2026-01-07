import { useState } from 'react';
import { Alert, SafeAreaView, ScrollView, StyleSheet, Text } from 'react-native';
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

export default function DamagesScreen() {
  const { supabase, session } = useSupabase();
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [description, setDescription] = useState('');
  const [licensePlate, setLicensePlate] = useState('');
  const [severity, setSeverity] = useState('licht');
  const [photo, setPhoto] = useState<PickedFile | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function pickPhoto() {
    const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
    if (res.canceled || !res.assets?.length) return;
    const asset = res.assets[0];
    setPhoto({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType });
  }

  async function handleSubmit() {
    if (!session) {
      Alert.alert('Niet ingelogd', 'Log in om een schade te melden.');
      return;
    }
    if (!description) {
      Alert.alert('Omschrijving ontbreekt', 'Beschrijf de schade.');
      return;
    }

    setSubmitting(true);
    try {
      let photoPath: string | null = null;
      if (photo) {
        photoPath = await uploadFromUri({
          bucket: 'receipts',
          uri: photo.uri,
          originalName: photo.name ?? 'schade',
          userId: session.user.id,
        });
      }

      const { error } = await supabase.from('damage_reports').insert({
        user_id: session.user.id,
        date,
        description,
        license_plate: licensePlate || null,
        severity,
        photo_paths: photoPath ? [photoPath] : null,
        status: 'open',
      });

      if (error) throw error;
      Alert.alert('Verzonden', 'Schade opgeslagen.');
      setDescription('');
      setLicensePlate('');
      setPhoto(null);
    } catch (err: any) {
      if (err?.code === '42P01') {
        Alert.alert(
          'Tabel ontbreekt',
          'Maak de tabel damage_reports aan in Supabase. Zie mobile/README.md voor de velden.'
        );
      } else {
        Alert.alert('Opslaan mislukt', err?.message ?? 'Onbekende fout');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Schade melden</Text>
        <Text style={styles.subtitle}>Foto toevoegen is mogelijk; tabel moet nog worden aangemaakt.</Text>

        <InputField label="Datum (YYYY-MM-DD)" value={date} onChangeText={setDate} />
        <InputField label="Kenteken (optioneel)" value={licensePlate} onChangeText={setLicensePlate} autoCapitalize="characters" />
        <InputField
          label="Ernst (bijv. licht/middel/zwaar)"
          value={severity}
          onChangeText={setSeverity}
          autoCapitalize="none"
        />
        <InputField label="Omschrijving" value={description} onChangeText={setDescription} multiline numberOfLines={4} />

        <PrimaryButton title={photo ? 'Andere foto' : 'Foto toevoegen'} onPress={pickPhoto} />
        {photo ? <Text style={styles.fileLabel}>Gekozen: {photo.name ?? photo.uri}</Text> : null}

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
  fileLabel: {
    color: '#334155',
    fontSize: 12,
  },
});






