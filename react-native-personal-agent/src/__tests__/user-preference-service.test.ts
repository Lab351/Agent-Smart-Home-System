import { UserPreferenceService } from '@/services/user-preference-service';
import type { IStorageService } from '@/types';

class MemoryStorageService implements IStorageService {
  private readonly storage = new Map<string, string>();

  async getString(key: string): Promise<string | null> {
    return this.storage.get(key) ?? null;
  }

  async getJson<T>(key: string): Promise<T | null> {
    const value = await this.getString(key);
    return value ? (JSON.parse(value) as T) : null;
  }

  async setString(key: string, value: string): Promise<void> {
    this.storage.set(key, value);
  }

  async setJson(key: string, value: unknown): Promise<void> {
    this.storage.set(key, JSON.stringify(value));
  }

  async remove(key: string): Promise<void> {
    this.storage.delete(key);
  }
}

describe('UserPreferenceService', () => {
  it('returns defaults when no preference record exists', async () => {
    const service = new UserPreferenceService(new MemoryStorageService());
    const preferences = await service.loadPreferences();

    expect(preferences.preferences.defaultRoom).toBe('livingroom');
    expect(preferences.habits).toEqual([]);
  });

  it('persists habits and updated preferences', async () => {
    const service = new UserPreferenceService(new MemoryStorageService());

    await service.addHabit('晚上十点后把灯光调暗', 'lighting');
    await service.setPreference('lighting.preferredBrightness', 60);

    const habits = await service.getAllHabits();
    const brightness = await service.getPreference<number>('lighting.preferredBrightness');

    expect(habits).toHaveLength(1);
    expect(habits[0].content).toContain('灯光');
    expect(brightness).toBe(60);
  });
});
