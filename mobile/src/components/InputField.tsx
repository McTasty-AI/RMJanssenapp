import { View, Text, TextInput, StyleSheet, TextInputProps } from 'react-native';

type Props = TextInputProps & {
  label: string;
  description?: string;
};

export function InputField({ label, description, style, ...rest }: Props) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, style]}
        placeholderTextColor="#9ca3af"
        {...rest}
      />
      {description ? <Text style={styles.description}>{description}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    marginBottom: 14,
  },
  label: {
    fontWeight: '600',
    color: '#111827',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#111827',
    backgroundColor: '#fff',
  },
  description: {
    marginTop: 4,
    color: '#6b7280',
    fontSize: 12,
  },
});






