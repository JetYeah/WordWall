// 字垣 — 全局配置
import { Dimensions } from 'react-native';

const SCREEN = Dimensions.get('window');

const CONFIG = {
  screen: {
    width: SCREEN.width,
    height: SCREEN.height,
  },

  colors: {
    // 文字墙
    wallBg: '#F5E6C8',
    wallText: '#3D2B1F',
    // 解密卡
    cardBg: 'rgba(45, 35, 25, 0.82)',
    cardBorder: 'rgba(218, 165, 32, 0.45)',
    cardBorderActive: 'rgba(218, 165, 32, 0.9)',
    // 镂空
    holeBg: 'rgba(255, 248, 225, 0.12)',
    holeBorder: 'rgba(218, 165, 32, 0.7)',
    holeText: '#F5E6C8',
    // 匹配
    matchBg: 'rgba(76, 175, 80, 0.2)',
    matchBorder: '#4CAF50',
    matchText: '#81C784',
    // 全局
    primary: '#C8A96E',
    primaryDark: '#A0824A',
    background: '#1A1612',
    surface: '#2D2318',
    text: '#F5E6C8',
    textSecondary: '#A89878',
    success: '#4CAF50',
  },

  animation: {
    rotateDuration: 300,
    celebrationDuration: 2000,
  },

  storage: {
    playerProgress: 'decode_card_progress',
    gameSettings: 'decode_card_settings',
  },
};

export { CONFIG };
export default CONFIG;
