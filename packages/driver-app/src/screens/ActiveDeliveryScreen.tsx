import { OrderStatus, ProofOfDeliveryType } from '@marhaba/shared';
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { tokenStore } from '../lib/auth';
import { setActiveOrder, startLocationTracking, stopLocationTracking } from '../lib/location';
import { enqueue, pendingCount } from '../lib/outbox';

/**
 * Minimal driver flow for the currently-assigned order. Every action is
 * enqueued to the offline outbox first (with an Idempotency-Key) and synced in
 * the background, so the driver can operate through dead zones.
 */
export function ActiveDeliveryScreen({ onSignOut }: { onSignOut: () => void }) {
  const [orderId, setOrderId] = useState('');
  const [otp, setOtp] = useState('');
  const [pending, setPending] = useState(0);
  const [tracking, setTracking] = useState(false);

  useEffect(() => {
    const t = setInterval(() => void pendingCount().then(setPending), 3000);
    return () => clearInterval(t);
  }, []);

  async function toggleTracking() {
    if (tracking) {
      await stopLocationTracking();
      setActiveOrder(null);
      setTracking(false);
    } else {
      const ok = await startLocationTracking();
      if (!ok) return Alert.alert('Location permission required');
      setActiveOrder(orderId || null);
      setTracking(true);
    }
  }

  async function transition(to: OrderStatus) {
    if (!orderId) return Alert.alert('Enter an order id');
    await enqueue(
      'ORDER_TRANSITION',
      { orderId, body: { to } },
      `${orderId}:${to}:${Date.now()}`,
    );
    void pendingCount().then(setPending);
    Alert.alert('Queued', `${to.replaceAll('_', ' ')} will sync when online.`);
  }

  async function completeWithOtp() {
    if (!orderId || otp.length !== 6) return Alert.alert('Enter the 6-digit OTP');
    const loc = await Location.getCurrentPositionAsync({});
    await enqueue(
      'PROOF_OF_DELIVERY',
      {
        orderId,
        body: {
          type: ProofOfDeliveryType.OTP_CODE,
          otpCode: otp,
          lng: loc.coords.longitude,
          lat: loc.coords.latitude,
          capturedAt: new Date().toISOString(),
        },
      },
      `${orderId}:pod:${Date.now()}`,
    );
    void pendingCount().then(setPending);
    Alert.alert('Delivered', 'Proof captured and queued.');
  }

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Text style={styles.pending}>Outbox: {pending} pending</Text>
        <TouchableOpacity onPress={async () => { await tokenStore.clear(); onSignOut(); }}>
          <Text style={styles.link}>Sign out</Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.input}
        placeholder="Active order id"
        autoCapitalize="none"
        value={orderId}
        onChangeText={setOrderId}
      />

      <TouchableOpacity style={[styles.button, tracking && styles.buttonActive]} onPress={toggleTracking}>
        <Text style={styles.buttonText}>{tracking ? 'Stop sharing location' : 'Start sharing location'}</Text>
      </TouchableOpacity>

      <View style={styles.actions}>
        <ActionButton label="En route to pickup" onPress={() => transition(OrderStatus.EN_ROUTE_TO_PICKUP)} />
        <ActionButton label="Picked up" onPress={() => transition(OrderStatus.PICKED_UP)} />
        <ActionButton label="Out for delivery" onPress={() => transition(OrderStatus.OUT_FOR_DELIVERY)} />
      </View>

      <View style={styles.podBox}>
        <Text style={styles.podTitle}>Complete delivery (OTP)</Text>
        <TextInput
          style={styles.input}
          placeholder="6-digit code"
          keyboardType="number-pad"
          maxLength={6}
          value={otp}
          onChangeText={setOtp}
        />
        <ActionButton label="Confirm delivered" onPress={completeWithOtp} primary />
      </View>
    </View>
  );
}

function ActionButton({ label, onPress, primary }: { label: string; onPress: () => void; primary?: boolean }) {
  return (
    <TouchableOpacity style={[styles.action, primary && styles.actionPrimary]} onPress={onPress}>
      <Text style={[styles.actionText, primary && styles.actionTextPrimary]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, gap: 14, backgroundColor: '#fff' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pending: { color: '#6b7280' },
  link: { color: '#0e7c66', fontWeight: '600' },
  input: { borderWidth: 1, borderColor: '#d4d4d4', borderRadius: 8, padding: 12, fontSize: 16 },
  button: { backgroundColor: '#0e7c66', borderRadius: 8, padding: 14, alignItems: 'center' },
  buttonActive: { backgroundColor: '#b45309' },
  buttonText: { color: '#fff', fontWeight: '600' },
  actions: { gap: 8 },
  action: { borderWidth: 1, borderColor: '#0e7c66', borderRadius: 8, padding: 12, alignItems: 'center' },
  actionPrimary: { backgroundColor: '#0e7c66' },
  actionText: { color: '#0e7c66', fontWeight: '600' },
  actionTextPrimary: { color: '#fff' },
  podBox: { marginTop: 8, gap: 8, borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 14 },
  podTitle: { fontWeight: '700', fontSize: 16 },
});
