import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'RMJ Driver',
  slug: 'rmj-driver',
  scheme: 'rmjdriver',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  assetBundlePatterns: ['**/*'],
  extra: {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  },
  experiments: {
    typedRoutes: true,
  },
};

export default config;






