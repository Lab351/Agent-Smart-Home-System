import { PreferencesScreen } from '@/features/preferences/preferences-screen';
import { useAppState } from '@/store';

export default function PreferencesRoute() {
  const { preferences } = useAppState();

  const preferenceSnapshot = {
    defaultRoom:
      preferences?.preferences.defaultRoom === 'livingroom'
        ? '客厅'
        : preferences?.preferences.defaultRoom ?? '客厅',
    bedtime: preferences?.preferences.lighting.bedtime ?? '22:00',
    brightness: preferences?.preferences.lighting.preferredBrightness ?? 80,
    preferredTemp: preferences?.preferences.climate.preferredTemp ?? 26,
    climateMode:
      preferences?.preferences.climate.mode === 'cool'
        ? '制冷'
        : preferences?.preferences.climate.mode === 'heat'
          ? '制热'
          : preferences?.preferences.climate.mode === 'dry'
            ? '除湿'
            : '自动',
  };

  return (
    <PreferencesScreen
      preferences={preferenceSnapshot}
      habits={
        preferences?.habits.map(habit => habit.content) ?? [
          '晚上十点后自动调暗灯光',
          '睡前空调保持 26 度',
        ]
      }
    />
  );
}
