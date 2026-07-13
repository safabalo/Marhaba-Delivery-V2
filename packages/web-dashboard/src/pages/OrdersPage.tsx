import type { Order } from '@marhaba/shared';
import { useQuery } from '@tanstack/react-query';
import { Card, CardBody, CardHeader, StatusBadge } from '../components/ui/card';
import { api } from '../lib/api';
import { formatMoney } from '../lib/utils';

export function OrdersPage() {
  const orders = useQuery({
    queryKey: ['orders'],
    queryFn: () => api.get<Order[]>('/orders'),
  });

  return (
    <Card>
      <CardHeader>
        <h2 className="font-semibold">Orders</h2>
      </CardHeader>
      <CardBody className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-neutral-500">
            <tr>
              <th className="py-2">Reference</th>
              <th>Status</th>
              <th>Items</th>
              <th className="text-right">Total</th>
              <th className="text-right">Placed</th>
            </tr>
          </thead>
          <tbody>
            {(orders.data ?? []).map((o) => (
              <tr key={o.id} className="border-t border-neutral-100">
                <td className="py-2 font-medium">{o.reference}</td>
                <td><StatusBadge status={o.status} /></td>
                <td>{o.items?.length ?? 0}</td>
                <td className="text-right">
                  {formatMoney(o.pricing?.totalMinor ?? 0, o.currency)}
                </td>
                <td className="text-right text-neutral-500">
                  {new Date(o.createdAt).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {orders.isLoading && <p className="p-4 text-neutral-400">Loading…</p>}
      </CardBody>
    </Card>
  );
}
