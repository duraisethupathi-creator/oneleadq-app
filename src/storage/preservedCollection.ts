import AsyncStorage from '@react-native-async-storage/async-storage';

/** Preserve unreadable bytes in place. Recovery must be explicit, never a seed reset. */
export function preservedCollection<T extends { id: string }>(key: string, defaults: T[]) {
  let pending: Promise<unknown> = Promise.resolve();
  function serial<R>(operation: () => Promise<R>): Promise<R> {
    const result = pending.then(operation);
    pending = result.catch(() => undefined);
    return result;
  }
  function collection(value: unknown): T[] {
    // Keep legacy/unknown fields; only require the collection structure used by callers.
    if (!Array.isArray(value) || value.some(item => !item || typeof item !== 'object' ||
      Array.isArray(item) || typeof item.id !== 'string' || !item.id.length)) {
      throw new Error('Saved collection is unreadable. Existing data has been preserved.');
    }
    return value as T[];
  }
  function decode(raw: string): T[] {
    let value: unknown;
    try { value = JSON.parse(raw); }
    catch { throw new Error('Saved collection is unreadable. Existing data has been preserved.'); }
    return collection(value);
  }
  return {
    load: () => serial(async () => {
      const raw = await AsyncStorage.getItem(key);
      if (raw !== null) return decode(raw);
      const initial = collection(defaults);
      await AsyncStorage.setItem(key, JSON.stringify(initial));
      return initial;
    }),
    save: (items: T[]) => serial(async () => {
      const value = collection(items);
      // A caller's fallback UI must not overwrite corrupt saved bytes.
      const raw = await AsyncStorage.getItem(key);
      if (raw !== null) decode(raw);
      await AsyncStorage.setItem(key, JSON.stringify(value));
    }),
  };
}
