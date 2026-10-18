import { requireOptionalNativeModule } from 'expo';
import { loadCurrentClientId } from '../storage/clientStorage';
import { createTrustedWorker, TrustNative } from './trustedWindowsCore';
// Missing native support fails closed and never prevents the Android application shell rendering.
let native: TrustNative | null = null;
try { native = requireOptionalNativeModule<TrustNative>('OneLeadQTrust'); } catch { /* Approved native APK is required. */ }
export const trustedWindows = createTrustedWorker(native, loadCurrentClientId);
export const hasTrustedWindowsNativeSupport = native !== null;
