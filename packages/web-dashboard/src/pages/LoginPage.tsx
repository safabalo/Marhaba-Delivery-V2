import { loginSchema } from '@marhaba/shared';
import { useState } from 'react';
import { Button } from '../components/ui/button';
import { Card, CardBody, CardHeader } from '../components/ui/card';
import { useAuth } from '../hooks/useAuth';

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('dispatcher@marhaba.delivery');
  const [password, setPassword] = useState('Password123');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError('Enter a valid email and password');
      return;
    }
    setBusy(true);
    try {
      await login(parsed.data);
    } catch {
      setError('Invalid credentials');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-neutral-100 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <h1 className="text-lg font-bold text-brand">Marhaba Dispatch</h1>
          <p className="text-sm text-neutral-500">Sign in to your operations console</p>
        </CardHeader>
        <CardBody>
          <form onSubmit={onSubmit} className="space-y-3">
            <label className="block text-sm">
              <span className="text-neutral-600">Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="text-neutral-600">Password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2"
              />
            </label>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
