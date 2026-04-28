import React, { useState, forwardRef } from 'react';
import {
  View, TextInput, Text, TouchableOpacity,
  StyleSheet, TextInputProps, ViewStyle,
} from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, interpolate,
} from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../../hooks/useTheme';

interface Props extends TextInputProps {
  label:             string;
  error?:            string;
  leftIcon?:         string;
  rightIcon?:        string;
  onRightIconPress?: () => void;
  rightElement?:     React.ReactNode;
  containerStyle?:   ViewStyle;
  isPassword?:       boolean;
}

export const Input = forwardRef<TextInput, Props>(({
  label, error, leftIcon, rightIcon, onRightIconPress, rightElement,
  containerStyle, isPassword, value, onFocus, onBlur, ...rest
}, ref) => {
  const { theme } = useTheme();
  const { colors, borderRadius, fontSize, fontWeight } = theme;

  const [focused,  setFocused]  = useState(false);
  const [showPass, setShowPass] = useState(false);

  const labelAnim  = useSharedValue(value ? 1 : 0);
  const borderAnim = useSharedValue(0);

  const labelStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(labelAnim.value, [0, 1], [0, -22]) },
      { scale:      interpolate(labelAnim.value, [0, 1], [1, 0.82]) },
    ],
    color: interpolate(labelAnim.value, [0, 1], [0, 1]) > 0.5
      ? colors.primary
      : colors.textTertiary,
  }));

  const borderStyle = useAnimatedStyle(() => ({
    borderColor: error
      ? colors.error
      : focused
        ? colors.inputBorderFocus
        : colors.inputBorder,
    borderWidth: withTiming(focused ? 2 : 1.5, { duration: 160 }),
  }));

  const handleFocus = (e: any) => {
    setFocused(true);
    labelAnim.value  = withTiming(1, { duration: 160 });
    borderAnim.value = withTiming(1, { duration: 160 });
    onFocus?.(e);
  };

  const handleBlur = (e: any) => {
    setFocused(false);
    if (!value) labelAnim.value = withTiming(0, { duration: 160 });
    borderAnim.value = withTiming(0, { duration: 160 });
    onBlur?.(e);
  };

  const paddingLeft  = leftIcon  ? 48 : 16;
  const paddingRight = (isPassword || rightIcon || rightElement) ? 48 : 16;

  return (
    <View style={[styles.wrapper, containerStyle]}>
      <Animated.View style={[
        styles.container,
        {
          backgroundColor: colors.inputBg,
          borderRadius: borderRadius.md,
          paddingLeft,
          paddingRight,
        },
        borderStyle,
      ]}>
        {/* Label flottant */}
        <Animated.Text
          style={[styles.label, { left: paddingLeft }, labelStyle]}
          pointerEvents="none"
        >
          {label}
        </Animated.Text>

        {/* Icône gauche */}
        {leftIcon && (
          <Icon
            name={leftIcon}
            size={18}
            color={focused ? colors.primary : colors.textTertiary}
            style={styles.iconLeft}
          />
        )}

        <TextInput
          ref={ref}
          {...rest}
          value={value}
          onFocus={handleFocus}
          onBlur={handleBlur}
          secureTextEntry={isPassword && !showPass}
          placeholderTextColor="transparent"
          style={[
            styles.input,
            {
              color:      colors.textPrimary,
              fontSize:   fontSize.base,
              fontWeight: fontWeight.regular,
              paddingTop: 20,
              paddingBottom: 8,
            },
          ]}
        />

        {/* Icône droite / toggle password / élément custom */}
        {rightElement
          ? <View style={styles.iconRight}>{rightElement}</View>
          : (isPassword || rightIcon) && (
              <TouchableOpacity
                onPress={isPassword ? () => setShowPass(v => !v) : onRightIconPress}
                style={styles.iconRight}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Icon
                  name={isPassword ? (showPass ? 'eye-off' : 'eye') : rightIcon!}
                  size={18}
                  color={focused ? colors.primary : colors.textTertiary}
                />
              </TouchableOpacity>
            )
        }
      </Animated.View>

      {error ? (
        <Text style={[styles.errorText, { color: colors.error, fontSize: fontSize.xs }]}>
          {error}
        </Text>
      ) : null}
    </View>
  );
});

Input.displayName = 'Input';

const styles = StyleSheet.create({
  wrapper:   { marginBottom: 0 },
  container: {
    height: 58,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  label:     {
    position: 'absolute',
    fontSize: 14,
    fontWeight: '400',
  },
  input:     { flex: 1 },
  iconLeft:  { position: 'absolute', left: 16 },
  iconRight: { position: 'absolute', right: 16 },
  errorText: { marginTop: 4, marginLeft: 4 },
});
