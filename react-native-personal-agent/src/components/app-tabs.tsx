import { NativeTabs } from 'expo-router/unstable-native-tabs';
import React from 'react';

export default function AppTabs() {
  return (
    <NativeTabs
      backgroundColor="#F6F0E8"
      iconColor="#2D5B57"
      tintColor="#1B2E2B"
      labelStyle={{
        color: '#5D726F',
        fontSize: 11,
        selected: {
          color: '#1B2E2B',
        },
      }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>首页</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="voice-control">
        <NativeTabs.Trigger.Label>语音</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="room-binding">
        <NativeTabs.Trigger.Label>房间</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="preferences">
        <NativeTabs.Trigger.Label>偏好</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
