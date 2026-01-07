import { useState } from 'react';
import { Alert, SafeAreaView, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { InputField } from '~/components/InputField';
import { PrimaryButton } from '~/components/PrimaryButton';
import { useSupabase } from '~/hooks/useSupabase';
import { formatWeekId, formatYearMonth } from '~/utils/week';

export default function HoursScreen() {
  const { supabase, session } = useSupabase();
  const today = new Date().toISOString().slice(0, 10);

  const [date, setDate] = useState(today);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [breakMinutes, setBreakMinutes] = useState('30');
  const [startMileage, setStartMileage] = useState('');
  const [endMileage, setEndMileage] = useState('');
  const [toll, setToll] = useState('Geen');
  const [licensePlate, setLicensePlate] = useState('');
  const [tripNumber, setTripNumber] = useState('');
  const [remarks, setRemarks] = useState('');
  const [overnight, setOvernight] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function ensureWeeklyLog(weekId: string, yearMonth: string) {
    const userId = session?.user.id;
    if (!userId) throw new Error('Niet ingelogd');

    const { data, error } = await supabase
      .from('weekly_logs')
      .select('id')
      .eq('week_id', weekId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') throw error;
    if (data?.id) return data.id;

    const insertRes = await supabase
      .from('weekly_logs')
      .insert({ week_id: weekId, user_id: userId, remarks, status: 'concept', year_month: yearMonth })
      .select('id')
      .single();

    if (insertRes.error || !insertRes.data?.id) throw insertRes.error ?? new Error('Weekly log insert failed');
    return insertRes.data.id;
  }

  async function handleSubmit() {
    if (!session) {
      Alert.alert('Niet ingelogd', 'Log eerst in om uren te registreren.');
      return;
    }
    if (!date) {
      Alert.alert('Datum', 'Vul een datum in (YYYY-MM-DD).');
      return;
    }

    setSubmitting(true);
    const weekId = formatWeekId(date);
    const yearMonth = formatYearMonth(date);

    try {
      const weeklyLogId = await ensureWeeklyLog(weekId, yearMonth);
      const { error } = await supabase.from('daily_logs').insert({
        weekly_log_id: weeklyLogId,
        date,
        day_name: new Date(date).toLocaleDateString('nl-NL', { weekday: 'long' }),
        status: 'gewerkt',
        start_time: startTime || null,
        end_time: endTime || null,
        break_time: breakMinutes ? `${breakMinutes} minutes` : null,
        start_mileage: startMileage ? Number(startMileage) : null,
        end_mileage: endMileage ? Number(endMileage) : null,
        toll: toll || null,
        license_plate: licensePlate || null,
        overnight_stay: overnight,
        trip_number: tripNumber || null,
      });

      if (error) throw error;
      Alert.alert('Succes', `Dagstaat opgeslagen onder week ${weekId}.`);
    } catch (err: any) {
      Alert.alert('Opslaan mislukt', err?.message ?? 'Onbekende fout');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Uren / Dagstaat</Text>
        <Text style={styles.subtitle}>Sla je dag op; je week wordt automatisch aangemaakt.</Text>

        <InputField label="Datum (YYYY-MM-DD)" value={date} onChangeText={setDate} keyboardType="numbers-and-punctuation" />
        <View style={styles.row}>
          <View style={{ flex: 1, marginRight: 6 }}>
            <InputField label="Starttijd (HH:MM)" value={startTime} onChangeText={setStartTime} placeholder="07:30" />
          </View>
          <View style={{ flex: 1, marginLeft: 6 }}>
            <InputField label="Eindtijd (HH:MM)" value={endTime} onChangeText={setEndTime} placeholder="17:00" />
          </View>
        </View>
        <InputField
          label="Pauze (minuten)"
          value={breakMinutes}
          onChangeText={setBreakMinutes}
          keyboardType="numeric"
          placeholder="30"
        />
        <View style={styles.row}>
          <View style={{ flex: 1, marginRight: 6 }}>
            <InputField
              label="Begin km-stand"
              value={startMileage}
              onChangeText={setStartMileage}
              keyboardType="numeric"
              placeholder="120000"
            />
          </View>
          <View style={{ flex: 1, marginLeft: 6 }}>
            <InputField
              label="Eind km-stand"
              value={endMileage}
              onChangeText={setEndMileage}
              keyboardType="numeric"
              placeholder="120220"
            />
          </View>
        </View>
        <InputField
          label="Tol (bijv. Geen/BE/DE/BE+DE)"
          value={toll}
          onChangeText={setToll}
          placeholder="Geen"
        />
        <InputField label="Kenteken" value={licensePlate} onChangeText={setLicensePlate} placeholder="12-ABC-3" autoCapitalize="characters" />
        <InputField label="Ritnummer (optioneel)" value={tripNumber} onChangeText={setTripNumber} />
        <InputField label="Opmerkingen week (optioneel)" value={remarks} onChangeText={setRemarks} multiline numberOfLines={3} />

        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Overnachting</Text>
          <Switch value={overnight} onValueChange={setOvernight} />
        </View>

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
  row: {
    flexDirection: 'row',
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
});






