import { SOCKET_EVENT, type LocationPing } from '@marhaba/shared';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { getSocket } from './socket';
import { enqueue } from './outbox';

export const LOCATION_TASK = 'marhaba-location-task';
const THROTTLE_MS = 5000;

let lastSentAt = 0;
let activeOrderId: string | null = null;

export function setActiveOrder(orderId: string | null): void {
  activeOrderId = orderId;
}

/**
 * Background location task. Client-side throttling limits emissions to one per
 * THROTTLE_MS. Each ping is sent over the live socket when connected; if the
 * socket is down it falls back to the durable outbox so no movement is lost.
 */
TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
  if (error || !data) return;
  const { locations } = data as { locations: Location.LocationObject[] };
  const latest = locations[locations.length - 1];
  if (!latest) return;

  const now = Date.now();
  if (now - lastSentAt < THROTTLE_MS) return;
  lastSentAt = now;

  const ping: LocationPing = {
    lng: latest.coords.longitude,
    lat: latest.coords.latitude,
    headingDeg: latest.coords.heading ?? undefined,
    speedMps: latest.coords.speed ?? undefined,
    accuracyM: latest.coords.accuracy ?? undefined,
    recordedAt: new Date(latest.timestamp),
    orderId: activeOrderId ?? undefined,
  };

  const socket = getSocket();
  if (socket.connected) {
    socket.emit(SOCKET_EVENT.DRIVER_LOCATION_UPDATE, ping);
  } else {
    void enqueue('LOCATION_PING', { body: ping });
  }
});

export async function startLocationTracking(): Promise<boolean> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') return false;
  const bg = await Location.requestBackgroundPermissionsAsync();
  if (bg.status !== 'granted') return false;

  const alreadyRunning = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
  if (alreadyRunning) return true;

  await Location.startLocationUpdatesAsync(LOCATION_TASK, {
    accuracy: Location.Accuracy.High,
    timeInterval: THROTTLE_MS,
    distanceInterval: 25,
    foregroundService: {
      notificationTitle: 'Marhaba Driver',
      notificationBody: 'Sharing your location for active deliveries',
    },
    pausesUpdatesAutomatically: false,
  });
  return true;
}

export async function stopLocationTracking(): Promise<void> {
  const running = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
  if (running) await Location.stopLocationUpdatesAsync(LOCATION_TASK);
}
