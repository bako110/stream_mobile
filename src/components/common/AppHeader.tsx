import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../../hooks/useTheme';
import { AppLogo } from './AppLogo';
import { STATUS_BAR_HEIGHT, HEADER_HEIGHT } from '../../styles';

export type HeaderVariant = 'home' | 'default' | 'transparent';

/**
 * BackButton — bouton retour standardisé à utiliser dans tous les headers custom.
 * Même style que AppHeader : arrow-left 22px, fond backgroundSecondary arrondi.
 */
export const BackButton: React.FC<{
  onPress: () => void;
  color?: string;
  transparent?: boolean;
}> = ({ onPress, color, transparent = false }) => {
  const { theme: { colors } } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      style={{
        width: 40, height: 40, borderRadius: 20,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: transparent ? 'rgba(0,0,0,0.35)' : colors.backgroundSecondary,
      }}
    >
      <Icon name="arrow-left" size={22} color={color ?? colors.textPrimary} />
    </TouchableOpacity>
  );
};

interface AppHeaderProps {
  title?:          string;
  variant?:        HeaderVariant;
  onBack?:         () => void;
  rightIcon?:      string;
  onRightPress?:   () => void;
  rightContent?:   React.ReactNode;
  centerContent?:  React.ReactNode;
  badgeCount?:     number;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  title,
  variant = 'default',
  onBack,
  rightIcon,
  onRightPress,
  rightContent,
  centerContent,
  badgeCount,
}) => {
  const { theme, isDark } = useTheme();
  const { colors, borderRadius, fontSize, fontWeight } = theme;

  const isHome = variant === 'home';

  return (
    <>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor="transparent"
        translucent
      />

      <View style={styles.outerWrap}>
      <View
        style={[
          styles.container,
          {
            backgroundColor: colors.surface,
            borderColor: colors.divider,
          },
        ]}
      >
        {/* Bande dégradée subtile — home uniquement */}
        {isHome && (
          <LinearGradient
            colors={[colors.primary + '12', 'transparent']}
            style={[StyleSheet.absoluteFill, { borderRadius: 24 }]}
            pointerEvents="none"
          />
        )}

        <View style={styles.inner}>
          {/* Gauche */}
          <View style={styles.side}>
            {onBack ? (
              <TouchableOpacity
                onPress={onBack}
                style={styles.iconBtn}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Icon name="arrow-left" size={22} color={colors.textPrimary} />
              </TouchableOpacity>
            ) : isHome ? (
              <AppLogo size="sm" style={{ marginLeft: -4 }} />
            ) : null}
          </View>

          {/* Centre */}
          {centerContent ? (
            <View style={styles.centerWrap}>{centerContent}</View>
          ) : isHome ? (
            <View style={styles.greetWrap}>
              <Text style={[styles.greetHi, { color: colors.textSecondary, fontSize: fontSize.xs }]}>
                Bienvenue sur
              </Text>
              <Text style={[styles.greetName, { color: colors.primary, fontSize: fontSize.xl, fontWeight: fontWeight.extraBold }]}>
                Gofolyx
              </Text>
            </View>
          ) : title ? (
            <Text
              style={[styles.title, { color: colors.textPrimary, fontSize: fontSize.lg, fontWeight: fontWeight.bold }]}
              numberOfLines={1}
            >
              {title}
            </Text>
          ) : null}

          {/* Droite */}
          <View style={[styles.side, styles.right]}>
            {rightContent ?? (
              rightIcon ? (
                <TouchableOpacity
                  onPress={onRightPress}
                  style={styles.iconBtn}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Icon name={rightIcon} size={22} color={colors.textPrimary} />
                  {(badgeCount ?? 0) > 0 && (
                    <View style={[styles.badge, { backgroundColor: colors.primary, borderRadius: borderRadius.full }]}>
                      <Text style={[styles.badgeText, { color: colors.textOnBrand, fontSize: fontSize.xs }]}>
                        {(badgeCount ?? 0) > 99 ? '99+' : String(badgeCount)}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              ) : null
            )}
          </View>
        </View>
      </View>
      </View>
    </>
  );
};

// Seule la structure — aucune valeur de couleur/typo ici
const styles = StyleSheet.create({
  // outerWrap : isole le paddingTop (status bar) du style visuel de la carte —
  // les mélanger ferait apparaître la zone status bar comme faisant partie de
  // la carte arrondie, avec un coin visible sous la status bar (cf. FeedScreen).
  outerWrap: {
    paddingTop: STATUS_BAR_HEIGHT,
    zIndex:     100,
  },
  // container : carte flottante (même design que FeedScreen) — hauteur et
  // paddings internes inchangés, seuls fond/bordure/radius/ombre reprennent
  // la référence.
  container: {
    height:           HEADER_HEIGHT,
    marginHorizontal: 10,
    borderRadius:     24,
    borderWidth:      1,
    shadowColor:      '#5B45B5',
    shadowOpacity:    0.10,
    shadowRadius:     14,
    shadowOffset:     { width: 0, height: 5 },
    elevation:        8,
  },
  inner: {
    flex:             1,
    flexDirection:    'row',
    alignItems:       'center',
    paddingHorizontal: 16,
  },
  side: {
    width:           64,
    alignItems:      'flex-start',
    justifyContent:  'center',
  },
  right: {
    alignItems: 'flex-end',
  },
  iconBtn: {
    width:           40,
    height:          40,
    alignItems:      'center',
    justifyContent:  'center',
    borderRadius:    20,
    backgroundColor: 'transparent',
  },
  title: {
    flex:       1,
    textAlign:  'center',
  },
  greetWrap: {
    flex:       1,
    alignItems: 'center',
  },
  centerWrap: {
    flex: 1,
  },
  greetHi: {
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  greetName: {
    letterSpacing: 1,
  },
  badge: {
    position:        'absolute',
    top:             4,
    right:           4,
    minWidth:        16,
    height:          16,
    alignItems:      'center',
    justifyContent:  'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    fontWeight: '700',
  },
});
