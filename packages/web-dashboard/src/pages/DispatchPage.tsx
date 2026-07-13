import {
  SOCKET_EVENT,
  type DispatchBoardOrder,
  type DriverLocation,
} from '@marhaba/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import Map, { Marker } from 'react-map-gl';
import { Button } from '../components/ui/button';
import { Card, CardBody, CardHeader, StatusBadge } from '../components/ui/card';
import { api } from '../lib/api';
import { getSocket, joinDispatch } from '../lib/socket';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;

export function DispatchPage() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [driverPins, setDriverPins] = useState<Record<string, DriverLocation>>({});

  const board = useQuery({
    queryKey: ['dispatch-board'],
    queryFn: () => api.get<DispatchBoardOrder[]>('/dispatch/board'),
    refetchInterval: 15_000,
  });

  const assign = useMutation({
    mutationFn: (orderId: string) =>
      api.post(`/orders/${orderId}/assign`, { mode: 'AUTO_NEAREST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dispatch-board'] }),
  });

  // Live board + driver-location updates over WebSocket.
  useEffect(() => {
    const socket = getSocket();
    joinDispatch();
    const onBoard = () => qc.invalidateQueries({ queryKey: ['dispatch-board'] });
    const onDriver = (loc: DriverLocation) =>
      setDriverPins((prev) => ({ ...prev, [loc.driverId]: loc }));
    socket.on(SOCKET_EVENT.DISPATCH_BOARD_UPDATE, onBoard);
    socket.on(SOCKET_EVENT.DRIVER_LOCATION, onDriver);
    return () => {
      socket.off(SOCKET_EVENT.DISPATCH_BOARD_UPDATE, onBoard);
      socket.off(SOCKET_EVENT.DRIVER_LOCATION, onDriver);
    };
  }, [qc]);

  const orders = board.data ?? [];
  const center = useMemo(() => {
    const first = orders[0];
    return { longitude: first?.dropoffLng ?? 55.27, latitude: first?.dropoffLat ?? 25.2 };
  }, [orders]);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[420px_1fr]">
      <Card className="max-h-[80vh] overflow-auto">
        <CardHeader className="flex items-center justify-between">
          <h2 className="font-semibold">Live board</h2>
          <span className="text-xs text-neutral-500">{orders.length} active</span>
        </CardHeader>
        <CardBody className="space-y-2">
          {orders.map((o) => (
            <button
              key={o.orderId}
              onClick={() => setSelected(o.orderId)}
              className={`block w-full rounded-md border p-3 text-left ${
                selected === o.orderId ? 'border-brand' : 'border-neutral-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{o.reference}</span>
                <StatusBadge status={o.status} />
              </div>
              <div className="mt-1 flex items-center justify-between text-xs text-neutral-500">
                <span>{o.driverName ?? 'Unassigned'}</span>
                <span>{Math.round(o.ageSeconds / 60)}m old</span>
              </div>
              {!o.driverId && (
                <Button
                  variant="secondary"
                  className="mt-2 h-7 px-2 text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    assign.mutate(o.orderId);
                  }}
                >
                  Auto-assign nearest
                </Button>
              )}
            </button>
          ))}
          {orders.length === 0 && <p className="text-sm text-neutral-400">No active orders.</p>}
        </CardBody>
      </Card>

      <Card className="overflow-hidden">
        {MAPBOX_TOKEN ? (
          <Map
            mapboxAccessToken={MAPBOX_TOKEN}
            initialViewState={{ ...center, zoom: 11 }}
            style={{ width: '100%', height: '80vh' }}
            mapStyle="mapbox://styles/mapbox/streets-v12"
          >
            {orders.map((o) => (
              <Marker key={o.orderId} longitude={o.dropoffLng} latitude={o.dropoffLat}>
                <div className="h-3 w-3 rounded-full border-2 border-white bg-brand shadow" />
              </Marker>
            ))}
            {Object.values(driverPins).map((d) => (
              <Marker key={d.driverId} longitude={d.lng} latitude={d.lat}>
                <div className="h-3 w-3 rounded-full border-2 border-white bg-amber-500 shadow" />
              </Marker>
            ))}
          </Map>
        ) : (
          <div className="grid h-[80vh] place-items-center text-sm text-neutral-400">
            Set VITE_MAPBOX_TOKEN to enable the live map.
          </div>
        )}
      </Card>
    </div>
  );
}
