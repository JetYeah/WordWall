import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';

// Native 端：用原生导航控制器（性能优于 JS stack）。
// 此文件只在 iOS/Android 打包时被 Metro 解析；web 端走 createAppStack.ts。
export const Stack = createNativeStackNavigator<RootStackParamList>();
