import { Navigate, Route, Routes, Link } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { DispatchPage } from './pages/DispatchPage';
import { LoginPage } from './pages/LoginPage';
import { OrdersPage } from './pages/OrdersPage';

function Shell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-6 py-3">
        <div className="flex items-center gap-6">
          <span className="text-lg font-bold text-brand">Marhaba Dispatch</span>
          <nav className="flex gap-4 text-sm">
            <Link to="/dispatch" className="hover:text-brand">Dispatch</Link>
            <Link to="/orders" className="hover:text-brand">Orders</Link>
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-neutral-500">
            {user?.fullName} · {user?.role}
          </span>
          <button onClick={() => void logout()} className="text-brand hover:underline">
            Sign out
          </button>
        </div>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}

export function App() {
  const { user, loading } = useAuth();
  if (loading) return <div className="grid min-h-screen place-items-center">Loading…</div>;
  if (!user) return <LoginPage />;

  return (
    <Shell>
      <Routes>
        <Route path="/dispatch" element={<DispatchPage />} />
        <Route path="/orders" element={<OrdersPage />} />
        <Route path="*" element={<Navigate to="/dispatch" replace />} />
      </Routes>
    </Shell>
  );
}
