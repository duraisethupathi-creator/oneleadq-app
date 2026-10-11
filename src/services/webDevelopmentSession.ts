import { WEB_DEVELOPMENT_BASE_URL } from './webDevelopmentAgent';

type SessionState = {
  token: string;
  expiresAt: number;
};

type PairingExchangeResponse = {
  ok?: boolean;
  sessionToken?: string;
  expiresAt?: number;
  scope?: string[];
  error?: string;
};

let session: SessionState | null = null;

const EXPIRY_MARGIN_MS = 30_000;

export function setWebDevelopmentSession(
  token: string,
  expiresAt: number
): void {
  const cleanToken = token.trim();

  if (!cleanToken) {
    throw new Error('Session token is required');
  }

  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    throw new Error('Session expiry is invalid');
  }

  session = {
    token: cleanToken,
    expiresAt,
  };
}

export function clearWebDevelopmentSession(): void {
  session = null;
}

export function hasWebDevelopmentSession(): boolean {
  if (!session) {
    return false;
  }

  if (session.expiresAt <= Date.now() + EXPIRY_MARGIN_MS) {
    clearWebDevelopmentSession();
    return false;
  }

  return true;
}

export async function getWebDevelopmentSessionToken(): Promise<string> {
  if (!hasWebDevelopmentSession() || !session) {
    throw new Error(
      'Web Development session is missing or expired. Pair this device again.'
    );
  }

  return session.token;
}

export function getWebDevelopmentSessionExpiry(): number | null {
  if (!hasWebDevelopmentSession() || !session) {
    return null;
  }

  return session.expiresAt;
}

export async function pairWebDevelopmentDevice(
  pairingCode: string,
  signal?: AbortSignal
): Promise<number> {
  const code = pairingCode.trim();

  if (!/^\d{6}$/.test(code)) {
    throw new Error('Enter the 6-digit pairing code shown on the laptop.');
  }

  const response = await fetch(
    `${WEB_DEVELOPMENT_BASE_URL}/web-development/session/exchange`,
    {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        pairingCode: code,
      }),
    }
  );

  const data = (await response.json()) as PairingExchangeResponse;

  if (
    !response.ok ||
    data.ok !== true ||
    typeof data.sessionToken !== 'string' ||
    !Number.isFinite(data.expiresAt) ||
    !Array.isArray(data.scope) ||
    !data.scope.includes('web-development')
  ) {
    throw new Error(
      data.error || 'Pairing failed. Generate a new pairing code and try again.'
    );
  }

  setWebDevelopmentSession(
    data.sessionToken,
    data.expiresAt as number
  );

  return data.expiresAt as number;
}