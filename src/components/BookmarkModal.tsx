// 字垣 — 书签分享弹窗
// 展示 BookmarkCard，点「分享」截图并调起系统分享（web 则下载 PNG）。

import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ActivityIndicator, ScrollView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BookmarkCard, BookmarkData } from './BookmarkCard';
import { shareViewAsImage, ShareOutcome } from '../utils/shareBookmark';
import { CONFIG } from '../config';
import { soundManager } from '../utils/soundManager';

interface Props {
  data: BookmarkData | null;
  onClose: () => void;
}

export const BookmarkModal: React.FC<Props> = ({ data, onClose }) => {
  const cardRef = useRef<View>(null);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  const handleShare = async () => {
    if (!data || busy) return;
    soundManager.playSound('button_click');
    setBusy(true);
    setHint(null);
    // 文件名用 ASCII：CJK 经 \w 清洗会被剥离，且部分分享目标对中文文件名不可靠
    const outcome = await shareViewAsImage(cardRef, { filename: `ziyuan-${data.date}` });
    setBusy(false);
    switch (outcome) {
      case 'shared':       // expo-sharing 在用户取消分享面板时也会 resolve，无法区分；统一中性提示
      case 'cancelled':
        setHint('分享面板已唤起，可在其中保存或转发'); break;
      case 'saved': setHint(Platform.OS === 'web' ? '已保存图片到本地' : '已保存'); break;
      case 'unavailable': setHint('当前设备不支持系统分享，可截图保存'); break;
      default: setHint('分享失败，可截图保存'); break;
    }
  };

  const handleClose = () => {
    soundManager.playSound('button_click');
    onClose();
  };

  return (
    <Modal visible={data !== null} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <ScrollView contentContainerStyle={styles.scroll} bounces={false}>
          <View style={styles.sheet}>
            <Text style={styles.title}>字垣书签</Text>
            <Text style={styles.subtitle}>分享你这局邂逅的一句之缘</Text>

            {/* 截图目标：必须处于布局中且可见 */}
            <View style={styles.cardWrap} collapsable={false}>
              {data && <BookmarkCard ref={cardRef} data={data} />}
            </View>

            {hint && <Text style={styles.hint}>{hint}</Text>}

            <View style={styles.actions}>
              <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={handleClose} disabled={busy}>
                <Text style={styles.btnGhostText}>关闭</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={handleShare} disabled={busy}>
                {busy ? (
                  <ActivityIndicator color={CONFIG.colors.background} size="small" />
                ) : (
                  <>
                    <Ionicons name="share-social-outline" size={18} color={CONFIG.colors.background} />
                    <Text style={styles.btnPrimaryText}>分享书签</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(10, 8, 6, 0.82)',
    justifyContent: 'center',
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: 40,
  },
  sheet: {
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: CONFIG.colors.primary,
    letterSpacing: 4,
  },
  subtitle: {
    fontSize: 13,
    color: CONFIG.colors.textSecondary,
    marginTop: 6,
    marginBottom: 20,
  },
  cardWrap: {
    // 关键：captureRef 需要该容器有真实尺寸，不能 collapsable 折叠
  },
  hint: {
    color: CONFIG.colors.textSecondary,
    fontSize: 12,
    marginTop: 14,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 13,
    paddingHorizontal: 24,
    borderRadius: 12,
    minWidth: 120,
  },
  btnGhost: {
    borderWidth: 1,
    borderColor: 'rgba(245,230,200,0.25)',
  },
  btnGhostText: {
    color: CONFIG.colors.textSecondary,
    fontSize: 15,
  },
  btnPrimary: {
    backgroundColor: CONFIG.colors.primary,
  },
  btnPrimaryText: {
    color: CONFIG.colors.background,
    fontSize: 15,
    fontWeight: '700',
  },
});
