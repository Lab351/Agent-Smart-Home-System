import { NativeTabs } from 'expo-router/unstable-native-tabs';
import React from 'react';

// 未选中状态颜色（置灰）
const INACTIVE_COLOR = '#9CA3AF';
// 选中状态颜色（主题色）
const ACTIVE_COLOR = '#2D5B57';

export default function AppTabs() {
  return (
    <NativeTabs
      backgroundColor="#F6F0E8"
      iconColor={{
        default: INACTIVE_COLOR,
        selected: ACTIVE_COLOR,
      }}
      tintColor="#1B2E2B"
      labelStyle={{
        color: INACTIVE_COLOR,
        fontSize: 11,
        selected: {
          color: ACTIVE_COLOR,
        },
      }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon sf="house" />
        <NativeTabs.Trigger.Label>首页</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="voice-control">
        <NativeTabs.Trigger.Icon sf="mic" />
        <NativeTabs.Trigger.Label>语音</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="room-binding">
        <NativeTabs.Trigger.Icon sf="door.left.hand.closed" />
        <NativeTabs.Trigger.Label>房间</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="preferences">
        <NativeTabs.Trigger.Icon sf="gearshape" />
        <NativeTabs.Trigger.Label>偏好</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
