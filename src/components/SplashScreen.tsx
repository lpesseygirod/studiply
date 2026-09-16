import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

export default function SplashScreen() {
  const textOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(textOpacity, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
  }, []);

  return (
    <LinearGradient
      colors={['#B8B5E4', '#C9A8D4', '#D4A0A0', '#E8B4A0', '#F0C890', '#E8A850']}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={styles.container}
    >
      <Animated.View style={[styles.content, { opacity: textOpacity }]}>
        <Text style={styles.title}>STUDIPLY</Text>
        <Text style={styles.subtitle}>AUTOMATIVE STUDY</Text>
      </Animated.View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
    gap: 10,
  },
  title: {
    fontSize: 32,
    fontWeight: '900',
    color: '#1A1A1A',
    letterSpacing: 8,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1A1A1A',
    letterSpacing: 4,
    opacity: 0.65,
  },
});
