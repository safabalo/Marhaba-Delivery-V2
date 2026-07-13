import * as SecureStore from 'expo-secure-store';

const ACCESS_KEY = 'mrb_access';
const REFRESH_KEY = 'mrb_refresh';

/**
 * Native token storage. Unlike the web dashboard (httpOnly cookies), the
 * driver app holds tokens in the OS secure enclave and sends the access token
 * as a Bearer header.
 */
export const tokenStore = {
  async setTokens(access: string, refresh?: string): Promise<void> {
    await SecureStore.setItemAsync(ACCESS_KEY, access);
    if (refresh) await SecureStore.setItemAsync(REFRESH_KEY, refresh);
  },
  getAccess: () => SecureStore.getItemAsync(ACCESS_KEY),
  getRefresh: () => SecureStore.getItemAsync(REFRESH_KEY),
  async clear(): Promise<void> {
    await SecureStore.deleteItemAsync(ACCESS_KEY);
    await SecureStore.deleteItemAsync(REFRESH_KEY);
  },
};
