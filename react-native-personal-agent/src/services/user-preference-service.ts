import { AsyncStorageService } from '@/platform';
import type { Habit, HabitCategory, IStorageService, UserPreferences } from '@/types';

const STORAGE_KEY = 'user-preferences';

export class UserPreferenceService {
  constructor(private readonly storage: IStorageService = new AsyncStorageService()) {}

  async loadPreferences(): Promise<UserPreferences> {
    const storedPreferences = await this.storage.getJson<UserPreferences>(STORAGE_KEY);
    return storedPreferences ?? this.getDefaultPreferences();
  }

  async savePreferences(preferences: UserPreferences): Promise<void> {
    await this.storage.setJson(STORAGE_KEY, preferences);
  }

  async getAllHabits(): Promise<Habit[]> {
    const preferences = await this.loadPreferences();
    return preferences.habits;
  }

  async addHabit(
    content: string,
    category: HabitCategory = 'general',
    frequency: number = 1
  ): Promise<Habit> {
    const preferences = await this.loadPreferences();
    const habit: Habit = {
      id: this.generateId(),
      content,
      category,
      timestamp: Date.now(),
      frequency,
      active: true,
    };

    preferences.habits.unshift(habit);
    preferences.lastUpdated = Date.now();
    await this.savePreferences(preferences);
    return habit;
  }

  async deleteHabit(habitId: string): Promise<boolean> {
    const preferences = await this.loadPreferences();
    preferences.habits = preferences.habits.filter(habit => habit.id !== habitId);
    preferences.lastUpdated = Date.now();
    await this.savePreferences(preferences);
    return true;
  }

  async updateHabit(habitId: string, updates: Partial<Habit>): Promise<Habit> {
    const preferences = await this.loadPreferences();
    const habitIndex = preferences.habits.findIndex(habit => habit.id === habitId);

    if (habitIndex === -1) {
      throw new Error(`Habit not found: ${habitId}`);
    }

    preferences.habits[habitIndex] = {
      ...preferences.habits[habitIndex],
      ...updates,
    };
    preferences.lastUpdated = Date.now();
    await this.savePreferences(preferences);
    return preferences.habits[habitIndex];
  }

  async getPreference<T>(path: string): Promise<T | null> {
    const preferences = await this.loadPreferences();
    const keys = path.split('.');

    let current: unknown = preferences.preferences;
    keys.forEach(key => {
      current = (current as Record<string, unknown> | undefined)?.[key];
    });

    return (current as T | undefined) ?? null;
  }

  async setPreference(path: string, value: unknown): Promise<void> {
    const preferences = await this.loadPreferences();
    const keys = path.split('.');

    let target = preferences.preferences as Record<string, unknown>;
    keys.slice(0, -1).forEach(key => {
      if (!target[key] || typeof target[key] !== 'object') {
        target[key] = {};
      }
      target = target[key] as Record<string, unknown>;
    });

    target[keys[keys.length - 1]] = value;
    preferences.lastUpdated = Date.now();
    await this.savePreferences(preferences);
  }

  async clearAll(): Promise<void> {
    await this.savePreferences(this.getDefaultPreferences());
  }

  getDefaultPreferences(): UserPreferences {
    return {
      habits: [],
      preferences: {
        defaultRoom: 'livingroom',
        lighting: {
          bedtime: '22:00',
          preferredBrightness: 80,
        },
        climate: {
          preferredTemp: 26,
          mode: 'cool',
        },
      },
      lastUpdated: Date.now(),
    };
  }

  private generateId(): string {
    return `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  }
}
