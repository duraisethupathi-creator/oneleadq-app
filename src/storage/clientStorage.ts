import AsyncStorage from '@react-native-async-storage/async-storage';
import { defaultClients } from '../data/defaultClients';
import { Client } from '../types/client';
import { preservedCollection } from './preservedCollection';

const KEY = '@oneleadq/clients/v1';

const store = preservedCollection<Client>(KEY, defaultClients);
export const loadClients = store.load;
export const saveClients = store.save;
const CURRENT_CLIENT_KEY = '@oneleadq/current-client/v1';

export async function saveCurrentClientId(
  clientId: string
) {
  await AsyncStorage.setItem(
    CURRENT_CLIENT_KEY,
    clientId
  );
}

export async function loadCurrentClientId():
  Promise<string | null> {
  return AsyncStorage.getItem(CURRENT_CLIENT_KEY);
}

export async function clearCurrentClientId() {
  await AsyncStorage.removeItem(
    CURRENT_CLIENT_KEY
  );
}
