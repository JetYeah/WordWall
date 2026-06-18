import { createStackNavigator } from '@react-navigation/stack';
import type { RootStackParamList } from '../../App';

// Web 端：native-stack 依赖 iOS/Android 原生导航控制器，web 无实现，改用纯 JS 的 stack。
// 此文件只在 web 打包时被 Metro 解析；native 端走 createAppStack.native.ts。
export const Stack = createStackNavigator<RootStackParamList>();
