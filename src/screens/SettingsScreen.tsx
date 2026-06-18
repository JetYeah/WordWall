import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  Switch,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GameSettings, DifficultyLevel } from '../game/types';
import { DIFFICULTY_CONFIGS } from '../game/puzzleGenerator';
import { CONFIG } from '../config';

interface SettingsScreenProps {
  settings: GameSettings;
  onSettingsChange: (settings: GameSettings) => void;
  devModeEnabled: boolean;
  onToggleDevMode: () => void;
  currentDifficulty: DifficultyLevel;
  onChangeDifficulty: (level: DifficultyLevel) => void;
  onBack: () => void;
}

const DIFFICULTY_ORDER: DifficultyLevel[] = ['easy', 'medium', 'hard'];

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  settings,
  onSettingsChange,
  devModeEnabled,
  onToggleDevMode,
  currentDifficulty,
  onChangeDifficulty,
  onBack,
}) => {
  const [local, setLocal] = useState(settings);
  const tapCountRef = useRef(0);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toggle = (key: keyof GameSettings) => {
    const next = { ...local, [key]: !local[key] };
    setLocal(next);
    onSettingsChange(next);
  };

  const handleAboutTap = () => {
    tapCountRef.current += 1;
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    tapTimerRef.current = setTimeout(() => { tapCountRef.current = 0; }, 1500);

    if (tapCountRef.current >= 5) {
      tapCountRef.current = 0;
      onToggleDevMode();
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={CONFIG.colors.background} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}>
          <Ionicons name="arrow-back" size={24} color={CONFIG.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>设置</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.body}>
        {/* Sound & Haptics */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>音效与触感</Text>

          <View style={styles.row}>
            <View>
              <Text style={styles.rowLabel}>音效</Text>
              <Text style={styles.rowDesc}>操作时播放音效</Text>
            </View>
            <Switch
              value={local.soundEnabled}
              onValueChange={() => toggle('soundEnabled')}
              trackColor={{ false: '#3D2B1F', true: CONFIG.colors.primary }}
              thumbColor="#F5E6C8"
            />
          </View>

          <View style={styles.row}>
            <View>
              <Text style={styles.rowLabel}>震动反馈</Text>
              <Text style={styles.rowDesc}>操作时振动提示</Text>
            </View>
            <Switch
              value={local.hapticEnabled}
              onValueChange={() => toggle('hapticEnabled')}
              trackColor={{ false: '#3D2B1F', true: CONFIG.colors.primary }}
              thumbColor="#F5E6C8"
            />
          </View>
        </View>

        {/* Dev mode section — visible only when enabled */}
        {devModeEnabled && (
          <View style={[styles.section, { borderColor: CONFIG.colors.primary, borderWidth: 1 }]}>
            <View style={styles.sectionRow}>
              <Ionicons name="bug-outline" size={18} color={CONFIG.colors.primary} />
              <Text style={[styles.sectionTitle, { marginBottom: 0, marginLeft: 8 }]}>
                开发者模式已开启
              </Text>
            </View>
            <Text style={styles.devHint}>游戏内可使用开发者工具栏：换题、查看答案、收藏、跳过</Text>
            <TouchableOpacity style={styles.devOffBtn} onPress={onToggleDevMode}>
              <Text style={styles.devOffBtnText}>关闭开发者模式</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* 难度选择 — 仅 dev mode 可见，切换后立即生效 */}
        {devModeEnabled && (
          <View style={styles.section}>
            <View style={styles.sectionRow}>
              <Ionicons name="speedometer-outline" size={18} color={CONFIG.colors.primary} />
              <Text style={[styles.sectionTitle, { marginBottom: 0, marginLeft: 8 }]}>
                难度（开发者）
              </Text>
            </View>
            <Text style={styles.devHint}>
              切换后立即按新难度重新生成今日题。普通玩家固定「中等」。
            </Text>
            <View style={styles.diffRow}>
              {DIFFICULTY_ORDER.map(level => {
                const cfg = DIFFICULTY_CONFIGS[level];
                const active = currentDifficulty === level;
                return (
                  <TouchableOpacity
                    key={level}
                    style={[
                      styles.diffBtn,
                      active && { backgroundColor: CONFIG.colors.primary, borderColor: CONFIG.colors.primary },
                    ]}
                    onPress={() => onChangeDifficulty(level)}
                  >
                    <Text style={[styles.diffLabel, active && { color: CONFIG.colors.background, fontWeight: '700' }]}>
                      {cfg.label}
                    </Text>
                    <Text style={[styles.diffDesc, active && { color: CONFIG.colors.background }]}>
                      {cfg.quoteLenMin}-{cfg.quoteLenMax} 字
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* About — 5-tap trigger for dev mode */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>关于</Text>
          <TouchableOpacity onPress={handleAboutTap} activeOpacity={1}>
            <Text style={styles.aboutText}>
              字垣（WordWall）— 文字筑墙，邂逅一句之缘{'\n\n'}
              在铺满万千文字的墙上移动并旋转解密卡，{'\n'}
              找到唯一正确的位置与角度，揭示那句与你结缘的名言。
            </Text>
          </TouchableOpacity>
          <Text style={styles.versionText}>v2.1.0</Text>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CONFIG.colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 52,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: CONFIG.colors.text,
  },
  body: {
    flex: 1,
    paddingHorizontal: 20,
  },
  section: {
    backgroundColor: CONFIG.colors.surface,
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: CONFIG.colors.primary,
    marginBottom: 16,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(245, 230, 200, 0.1)',
  },
  rowLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: CONFIG.colors.text,
    marginBottom: 2,
  },
  rowDesc: {
    fontSize: 12,
    color: CONFIG.colors.textSecondary,
  },
  devHint: {
    fontSize: 13,
    color: CONFIG.colors.textSecondary,
    lineHeight: 20,
    marginBottom: 16,
  },
  devOffBtn: {
    backgroundColor: 'rgba(245, 230, 200, 0.1)',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  devOffBtnText: {
    color: CONFIG.colors.textSecondary,
    fontSize: 14,
  },
  diffRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  diffBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(245, 230, 200, 0.06)',
    borderWidth: 1.5,
    borderColor: 'rgba(245, 230, 200, 0.12)',
  },
  diffLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: CONFIG.colors.text,
    marginBottom: 2,
  },
  diffDesc: {
    fontSize: 11,
    color: CONFIG.colors.textSecondary,
  },
  aboutText: {
    fontSize: 14,
    color: CONFIG.colors.textSecondary,
    lineHeight: 22,
  },
  versionText: {
    fontSize: 12,
    color: 'rgba(168, 152, 120, 0.5)',
    marginTop: 12,
    textAlign: 'center',
  },
});
