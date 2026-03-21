import { PreferencesScreen } from '@/features/preferences/preferences-screen';

export default function PreferencesRoute() {
  return (
    <PreferencesScreen
      preferences={{
        defaultRoom: '客厅',
        bedtime: '22:00',
        brightness: 80,
        preferredTemp: 26,
        climateMode: '制冷',
      }}
      habits={['晚上十点后自动调暗灯光', '睡前空调保持 26 度', '回家优先打开客厅主灯']}
    />
  );
}
