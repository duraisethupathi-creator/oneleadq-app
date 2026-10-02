import AsyncStorage from '@react-native-async-storage/async-storage';
import { defaultClients } from '../data/defaultClients';
import { Client } from '../types/client';

const KEY = '@oneleadq/clients/v1';

export async function loadClients(): Promise<Client[]> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) {
    await AsyncStorage.setItem(KEY, JSON.stringify(defaultClients));
    return defaultClients;
  }
  try {
    return JSON.parse(raw) as Client[];
  } catch {
    await AsyncStorage.setItem(KEY, JSON.stringify(defaultClients));
    return defaultClients;
  }
}

export async function saveClients(clients: Client[]) {
  await AsyncStorage.setItem(KEY, JSON.stringify(clients));
}
