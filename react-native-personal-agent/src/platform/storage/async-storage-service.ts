import AsyncStorage from '@react-native-async-storage/async-storage';

import type { IStorageService } from '@/types';

export class AsyncStorageService implements IStorageService {
  constructor(private readonly namespace: string = 'personal-agent') {}

  async getString(key: string): Promise<string | null> {
    return AsyncStorage.getItem(this.toKey(key));
  }

  async getJson<T>(key: string): Promise<T | null> {
    const value = await this.getString(key);

    if (!value) {
      return null;
    }

    return JSON.parse(value) as T;
  }

  async setString(key: string, value: string): Promise<void> {
    await AsyncStorage.setItem(this.toKey(key), value);
  }

  async setJson(key: string, value: unknown): Promise<void> {
    await this.setString(key, JSON.stringify(value));
  }

  async remove(key: string): Promise<void> {
    await AsyncStorage.removeItem(this.toKey(key));
  }

  private toKey(key: string): string {
    return `${this.namespace}:${key}`;
  }
}
