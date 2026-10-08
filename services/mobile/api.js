const KEY = 'voicer-mobile-session';
export let session;
try {session = JSON.parse(localStorage.getItem(KEY) || 'null');} catch {session = null;}
let refreshing;
export function setSession(value) {
  session = value;
  if (value) localStorage.setItem(KEY, JSON.stringify(value));
  else localStorage.removeItem(KEY);
}
export class APIError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}
async function parse(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new APIError(typeof data.detail === 'string' ? data.detail : `Ошибка сервера (${response.status})`, response.status);
  return data;
}
export async function login(email, password) {
  const data = await parse(await fetch('/api/v1/auth/login', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({email, password}), signal:AbortSignal.timeout(30000)}));
  setSession(data);
  return data;
}
async function refresh() {
  if (!refreshing) refreshing = (async () => {
    if (!session?.refresh_token) throw new APIError('Войдите снова', 401);
    const original = session;
    try {
      const data = await parse(await fetch('/api/v1/auth/refresh', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({refresh_token:session.refresh_token}), signal:AbortSignal.timeout(30000)}));
      if (session !== original) throw new APIError('Аккаунт изменился. Повторите вход.', 401);
      setSession(data);
    } catch(error) {
      if ([401,403].includes(error.status) && session === original) {
        setSession(null);
        window.dispatchEvent(new Event('auth-expired'));
      }
      throw error;
    }
  })().finally(() => {refreshing = null;});
  return refreshing;
}
export async function request(path, options = {}, retry = true) {
  if (!session) throw new APIError('Войдите снова', 401);
  const response = await fetch(path, {...options, headers:{...options.headers, Authorization:`Bearer ${session.access_token}`}, signal:AbortSignal.timeout(options.body ? 15*60*1000 : 30000)});
  if (response.status === 401 && retry) {await refresh(); return request(path, options, false);}
  return parse(response);
}
export async function allSellers() {
  const items = [];
  for (let offset = 0;; offset += 200) {
    const page = await request(`/api/v1/admin/sellers?is_active=true&limit=200&offset=${offset}`);
    items.push(...page.items);
    if (items.length >= page.total || page.items.length === 0) return items;
  }
}
