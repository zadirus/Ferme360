import { useEffect, useState } from 'preact/hooks';
import { Auth } from './Auth';
import { Carnet } from './Carnet';
import { StatusBar } from './StatusBar';
import { getState, resetNeedLogin, startAutoSync, subscribe } from './sync';
import { getToken, getUser, type User } from './session';

export function App() {
  const [user, setUser] = useState<User | null>(() => (getToken() ? getUser() : null));
  const [needLogin, setNeedLogin] = useState(false);

  useEffect(() => subscribe(() => setNeedLogin(getState().needLogin)), []);
  useEffect(() => (user ? startAutoSync() : undefined), [user]);

  if (!user || needLogin) {
    return (
      <Auth
        reconnect={needLogin}
        onDone={(u) => {
          resetNeedLogin();
          setNeedLogin(false);
          setUser(u);
        }}
      />
    );
  }

  return (
    <main>
      <header>
        <h1>Ferme360</h1>
        <span class="qui">{user.name}</span>
      </header>
      <StatusBar />
      <Carnet />
    </main>
  );
}
