export interface User {
  name: string;
  role: string;
}

const TOKEN = 'ferme360.token';
const USER = 'ferme360.user';

export const getToken = () => localStorage.getItem(TOKEN);

export function saveUser(user: User) {
  localStorage.setItem(USER, JSON.stringify(user));
}

export function getUser(): User | null {
  try {
    return JSON.parse(localStorage.getItem(USER) ?? 'null');
  } catch {
    return null;
  }
}

export function saveSession(token: string, user: User) {
  localStorage.setItem(TOKEN, token);
  localStorage.setItem(USER, JSON.stringify(user));
}

// Le jeton est effacé, mais les saisies restent sur le téléphone.
export function clearToken() {
  localStorage.removeItem(TOKEN);
}

export function deconnexion() {
  clearToken();
  localStorage.removeItem(USER);
}

export async function api<T>(path: string, body?: unknown): Promise<T> {
  const token = getToken();
  const res = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (out as { error?: string }).error ?? 'Erreur');
  return out as T;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}
