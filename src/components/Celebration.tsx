// 字垣 — 解谜成功庆祝粒子（一次性迸发，纯 Animated / native driver）
// 解出瞬间触发：若干金色彩屑向四周迸发并下落消散，增加「破解」的成就感。

import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

const PARTICLES = ['✦', '✧', '·', '✺', '⋆', '❋'];
const COLORS = ['#E0B341', '#C8A96E', '#F5E6C8', '#D9A441', '#9FDCE3'];

interface Particle {
  x: Animated.Value;
  y: Animated.Value;
  o: Animated.Value;
  s: Animated.Value;
  dx: number;
  dy: number;
  char: string;
  color: string;
  size: number;
  dist: number;
  dur: number;
}

interface Props {
  active: boolean;
}

export const Celebration: React.FC<Props> = ({ active }) => {
  const N = 16;
  // 粒子参数在挂载时一次性确定（本组件为 app 运行时代码，Math.random 可用）
  const parts = useRef<Particle[]>(
    Array.from({ length: N }, () => {
      const angle = Math.random() * Math.PI * 2;
      return {
        x: new Animated.Value(0),
        y: new Animated.Value(0),
        o: new Animated.Value(0),
        s: new Animated.Value(0.3),
        dx: Math.cos(angle),
        dy: Math.sin(angle) - 0.6, // 整体偏上飘
        char: PARTICLES[Math.floor(Math.random() * PARTICLES.length)],
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        size: 10 + Math.floor(Math.random() * 16),
        dist: 70 + Math.random() * 130,
        dur: 1000 + Math.floor(Math.random() * 500),
      };
    }),
  ).current;
  const fired = useRef(false);

  useEffect(() => {
    if (!active || fired.current) return;
    fired.current = true;
    const anims: Animated.CompositeAnimation[] = parts.map((p) => {
      const tx = p.dx * p.dist;
      const ty = p.dy * p.dist + 80; // 末段下落（重力感）
      p.o.setValue(1);
      return Animated.parallel([
        Animated.timing(p.x, { toValue: tx, duration: p.dur, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(p.y, { toValue: ty, duration: p.dur, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(p.s, { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.timing(p.o, { toValue: 0, duration: p.dur, delay: 250, useNativeDriver: true }),
      ]);
    });
    const all = Animated.parallel(anims);
    all.start();
    return () => all.stop();
  }, [active, parts]);

  if (!active) return null;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {parts.map((p, i) => (
        <Animated.Text
          key={i}
          style={{
            position: 'absolute',
            left: '50%',
            top: '40%',
            marginLeft: -8,
            color: p.color,
            fontSize: p.size,
            fontWeight: '700',
            opacity: p.o,
            transform: [
              { translateX: p.x },
              { translateY: p.y },
              { scale: p.s },
            ],
          }}
        >
          {p.char}
        </Animated.Text>
      ))}
    </View>
  );
};
