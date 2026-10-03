import AsyncStorage from '@react-native-async-storage/async-storage';
import { defaultGoogleAds } from '../data/defaultGoogleAds';
import { GoogleAdsCampaign } from '../types/googleAds';

const KEY = '@oneleadq/google-ads/v1';

export async function loadGoogleAds(): Promise<GoogleAdsCampaign[]> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) {
    await AsyncStorage.setItem(KEY, JSON.stringify(defaultGoogleAds));
    return defaultGoogleAds;
  }
  try {
    return JSON.parse(raw) as GoogleAdsCampaign[];
  } catch {
    await AsyncStorage.setItem(KEY, JSON.stringify(defaultGoogleAds));
    return defaultGoogleAds;
  }
}

export async function saveGoogleAds(items: GoogleAdsCampaign[]) {
  await AsyncStorage.setItem(KEY, JSON.stringify(items));
}
