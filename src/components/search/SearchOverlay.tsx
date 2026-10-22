/**
 * SearchOverlay — overlay de recherche plein écran, monté une seule fois à la
 * racine de la navigation (MainNavigator) et piloté par SearchOverlayContext.
 * Ouvrable depuis n'importe quel écran : barre de recherche de l'Accueil,
 * #hashtag tapé dans un texte (RichText), etc.
 *
 * Rendu dans un Modal natif : un #hashtag peut être tapé depuis un contenu
 * lui-même affiché dans un Modal (sheet commentaires…) — une simple View
 * absolue montée à la racine resterait alors cachée derrière.
 */
import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator,
  StyleSheet, Image, Modal, Linking, Platform, StatusBar,
} from 'react-native';
import Animated, { useAnimatedStyle, interpolate, FadeInDown } from 'react-native-reanimated';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';
import { useSearchOverlayState, type SearchOverlayState } from '../../context/SearchOverlayContext';
import { searchHistoryService } from '../../services/searchHistoryService';
import { apiClient } from '../../api/client';
import { AvatarWithBadge } from '../common/AvatarWithBadge';
import { CachedImage } from '../common/CachedImage';
import { GofolyxLoader } from '../common/FolixLoader';
import { AdCard, AdFullscreenPlayer, adIsPhone, type AdData } from '../ads';
import { openPhoneMenu } from '../../utils/phoneMenu';
import { FontSize, FontWeight } from '../../theme';
import { feedStyles as s } from '../../styles/FeedScreen.styles';

export const SearchOverlay: React.FC = () => {
  const state = useSearchOverlayState();
  if (!state || !state.isOpen) return null;
  return <SearchOverlayContent state={state} />;
};

const SearchOverlayContent: React.FC<{ state: SearchOverlayState }> = ({ state }) => {
  const { theme } = useTheme();
  const { colors } = theme;
  // Monté hors de tout écran (frère du Stack.Navigator) : useNavigation retombe
  // sur la navigation racine du NavigationContainer, comme BattleInviteModal.
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const {
    searchQuery, setSearchQuery, searchResults, setSearchResults, searching,
    searchFilter, setSearchFilter, searchHistory, setSearchHistory, historySuggestions,
    loadingMoreSearch, searchAd, popularContent, popularLoading,
    searchBarWidth, searchBarOpacity, searchInputRef,
    liveSearch, loadMoreSearch, commitSearch, closeSearch,
  } = state;

  // Pub vidéo ouverte en plein écran avec son (AdCard cliqué) — jamais d'ouverture
  // directe du CTA pour une vidéo, contrairement à une pub image.
  const [fullscreenAd, setFullscreenAd] = useState<AdData | null>(null);

  const handleAdImpression = useCallback((adId: string) => {
    apiClient.post(`/api/v1/ads/${adId}/impression`).catch(() => {});
  }, []);

  const handleAdPress = useCallback((adId: string, url: string) => {
    apiClient.post(`/api/v1/ads/${adId}/click`).catch(() => {});
    // url vide : AdCard/AdCTA ont déjà géré l'ouverture eux-mêmes (contact direct
    // via callPhone/openWhatsapp ou runAdButton) — rien d'autre à faire ici.
    if (!url) return;
    // cta_url peut être un numéro de téléphone brut (ancien format, sans les champs
    // contact_phone/contact_call/contact_whatsapp dédiés) — Linking.openURL échoue
    // silencieusement sur un numéro brut, il faut passer par tel:/whatsapp://.
    if (adIsPhone(url)) { openPhoneMenu(url.replace(/^tel:/i, '')); return; }
    Linking.openURL(url).catch(() => {});
  }, []);

  const animatedSearchBar = useAnimatedStyle(() => ({
    flex: interpolate(searchBarWidth.value, [0, 1], [0, 1]),
    opacity: searchBarOpacity.value,
    overflow: 'hidden',
  }));

  return (
    <Modal visible animationType="none" onRequestClose={closeSearch} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <StatusBar
          barStyle={theme.isDark ? 'light-content' : 'dark-content'}
          translucent
          backgroundColor="transparent"
        />

        {/* Header — même carte flottante que celui de l'Accueil, pour que
            l'ouverture depuis la barre de recherche du feed reste visuellement
            continue (la barre s'étire à la place de l'avatar et des icônes). */}
        <View style={{ paddingTop: insets.top + (Platform.OS === 'android' ? 8 : 6) }}>
          <View style={[s.header, { backgroundColor: colors.surface, borderColor: colors.divider }]}>
            <View style={s.headerRow}>
              <Animated.View style={[animatedSearchBar, {
                flexDirection: 'row', alignItems: 'center',
                paddingHorizontal: 10, height: 32,
                borderRadius: 17,
                backgroundColor: colors.backgroundSecondary,
                gap: 7, flex: 1, marginRight: 7,
              }]}>
                <Icon name="search" size={14} color={colors.primary} />
                <TextInput
                  ref={searchInputRef}
                  placeholder="Rechercher..."
                  placeholderTextColor={colors.textDisabled}
                  style={{ flex: 1, fontSize: FontSize.base, color: colors.textPrimary, padding: 0 }}
                  returnKeyType="search"
                  value={searchQuery}
                  onChangeText={(text) => { setSearchQuery(text); liveSearch(text, searchFilter); }}
                  onSubmitEditing={() => {
                    if (!searchQuery.trim()) return;
                    commitSearch(searchQuery);
                    liveSearch(searchQuery, searchFilter);
                  }}
                />
                {searching && <ActivityIndicator size="small" color={colors.primary} />}
                {searchQuery.length > 0 && !searching && (
                  <TouchableOpacity onPress={() => { setSearchQuery(''); setSearchResults(null); }}>
                    <Icon name="x-circle" size={14} color={colors.textTertiary} />
                  </TouchableOpacity>
                )}
              </Animated.View>

              <View style={s.headerRight}>
                <TouchableOpacity
                  style={[s.iconBtn, { backgroundColor: colors.primary + '18' }]}
                  onPress={closeSearch}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Icon name="x" size={19} color={colors.primary} />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>

        <Animated.View entering={FadeInDown.duration(180)} style={{ flex: 1, backgroundColor: colors.background }}>
          {(() => {
            const CATS: { key: 'all'|'users'|'events'|'concerts'|'reels'|'films'; label: string; icon: string; accent: string }[] = [
              { key: 'all',      label: 'Tout',        icon: 'grid',     accent: colors.primary },
              { key: 'users',    label: 'Personnes',   icon: 'users',    accent: '#7B3FF2' },
              { key: 'events',   label: 'Événements',  icon: 'calendar', accent: '#0EA5E9' },
              { key: 'concerts', label: 'Concerts',    icon: 'music',    accent: '#E0389A' },
              { key: 'reels',    label: 'Reels',       icon: 'video',    accent: '#10B981' },
              { key: 'films',    label: 'Films',       icon: 'film',     accent: '#F59E0B' },
            ];

            const SrRow = ({ onPress, children, last }: { onPress?: () => void; children: React.ReactNode; last?: boolean }) => (
              <TouchableOpacity
                onPress={onPress}
                activeOpacity={0.7}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 14,
                  paddingHorizontal: 16, paddingVertical: 12,
                  borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth,
                  borderBottomColor: colors.divider,
                }}
              >
                {children}
              </TouchableOpacity>
            );

            const SrSection = ({ icon, label, count, accent }: { icon: string; label: string; count: number; accent: string }) => (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 24, paddingBottom: 8 }}>
                <LinearGradient colors={[accent, accent + 'AA']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={icon} size={13} color="#fff" />
                </LinearGradient>
                <Text style={{ flex: 1, fontSize: FontSize.smPlus, fontWeight: FontWeight.extraBold, color: colors.textPrimary, letterSpacing: 0.2, textTransform: 'uppercase' }}>{label}</Text>
                <View style={{ backgroundColor: accent + '18', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 }}>
                  <Text style={{ fontSize: FontSize.xsPlus, fontWeight: FontWeight.extraBold, color: accent }}>{count}</Text>
                </View>
              </View>
            );

            // Card grille 9:16 — pour les résultats média (concerts, événements, reels, films, séries)
            const SrGridCard = ({ uri, icon, accent, title, sub, onPress }: {
              uri?: string | null; icon: string; accent: string; title: string; sub?: string; onPress: () => void;
            }) => (
              <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={{ width: '33%', padding: 4 }}>
                <View style={{ aspectRatio: 9 / 16, borderRadius: 14, overflow: 'hidden', backgroundColor: accent + '15' }}>
                  {uri ? (
                    <CachedImage uri={uri} style={{ width: '100%', height: '100%' }} />
                  ) : (
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name={icon} size={26} color={accent} />
                    </View>
                  )}
                  <LinearGradient
                    colors={['transparent', 'rgba(0,0,0,0.85)']}
                    style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '45%', justifyContent: 'flex-end', padding: 8 }}
                  >
                    <Text style={{ fontSize: FontSize.sm, fontWeight: FontWeight.extraBold, color: '#fff' }} numberOfLines={2}>{title}</Text>
                    {sub && <Text style={{ fontSize: FontSize.xs, color: 'rgba(255,255,255,0.75)', marginTop: 2 }} numberOfLines={1}>{sub}</Text>}
                  </LinearGradient>
                  <View style={{ position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name={icon} size={11} color="#fff" />
                  </View>
                </View>
              </TouchableOpacity>
            );

            const SrGrid = ({ children }: { children: React.ReactNode }) => (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12 }}>{children}</View>
            );

            // État idle — pas encore de query
            if (!searchQuery.trim() && !searchResults) return (
              <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

                {/* Pub — préchargée dès openSearch(), visible immédiatement à l'ouverture
                    sans attendre la moindre frappe. */}
                {searchAd && (
                  <View style={{ paddingHorizontal: 12, paddingTop: 10 }}>
                    <AdCard
                      ad={searchAd}
                      colors={colors}
                      searchOverlay
                      onImpression={handleAdImpression}
                      onPress={handleAdPress}
                      onOpenFullscreen={setFullscreenAd}
                    />
                  </View>
                )}

                {/* ── Historique ── */}
                {searchHistory.length > 0 && (
                  <View style={{ paddingTop: 20, paddingBottom: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 10 }}>
                      <Text style={{ fontSize: FontSize.xsPlus, fontWeight: FontWeight.extraBold, color: colors.textTertiary, letterSpacing: 1, textTransform: 'uppercase' }}>Recherches récentes</Text>
                      <TouchableOpacity
                        onPress={() => { searchHistoryService.clear(); setSearchHistory([]); }}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Text style={{ fontSize: FontSize.sm, fontWeight: FontWeight.semiBold, color: colors.primary }}>Tout effacer</Text>
                      </TouchableOpacity>
                    </View>
                    {searchHistory.map((h, i) => (
                      <View
                        key={h.query}
                        style={{
                          flexDirection: 'row', alignItems: 'center',
                          paddingHorizontal: 16, paddingVertical: 11,
                          borderBottomWidth: i < searchHistory.length - 1 ? StyleSheet.hairlineWidth : 0,
                          borderBottomColor: colors.divider,
                        }}
                      >
                        <TouchableOpacity
                          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }}
                          activeOpacity={0.7}
                          onPress={() => {
                            setSearchQuery(h.query);
                            setSearchFilter('all');
                            liveSearch(h.query, 'all');
                            commitSearch(h.query);
                          }}
                        >
                          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.backgroundSecondary, alignItems: 'center', justifyContent: 'center' }}>
                            <Icon name="clock" size={14} color={colors.textTertiary} />
                          </View>
                          <Text style={{ fontSize: FontSize.base, fontWeight: FontWeight.medium, color: colors.textPrimary, flex: 1 }} numberOfLines={1}>{h.query}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => { searchHistoryService.remove(h.query); setSearchHistory(searchHistoryService.getAll()); }}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Icon name="x" size={14} color={colors.textTertiary} />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}

                {/* Catégories rapides */}
                <View style={{ paddingHorizontal: 16, paddingTop: searchHistory.length > 0 ? 20 : 24, paddingBottom: 8 }}>
                  <Text style={{ fontSize: FontSize.xsPlus, fontWeight: FontWeight.extraBold, color: colors.textTertiary, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 14 }}>Explorer</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                    {[
                      { icon: 'calendar', label: 'Événements', accent: '#0EA5E9', nav: 'Events' },
                      { icon: 'music',    label: 'Concerts',   accent: '#E0389A', nav: 'Concerts' },
                      { icon: 'video',    label: 'Reels',      accent: '#10B981', nav: 'Tabs/Reels' },
                      { icon: 'film',     label: 'Films',      accent: '#3B82F6', nav: 'Movies' },
                      { icon: 'tv',       label: 'Séries',     accent: '#7B3FF2', nav: 'Series' },
                      { icon: 'trending-up', label: 'Tendances', accent: '#6366F1', nav: 'Trending' },
                      { icon: 'users',    label: 'Communautés', accent: '#7B3FF2', nav: 'Communities' },
                    ].map(({ icon, label, accent, nav: navTarget }) => (
                      <TouchableOpacity
                        key={label}
                        activeOpacity={0.75}
                        onPress={() => {
                          closeSearch();
                          if (navTarget === 'Tabs/Reels') {
                            (nav as any).navigate('Tabs', { screen: 'Reels' });
                          } else {
                            (nav as any).navigate(navTarget);
                          }
                        }}
                        style={{
                          flexDirection: 'row', alignItems: 'center', gap: 8,
                          paddingHorizontal: 14, paddingVertical: 10,
                          borderRadius: 14, borderWidth: StyleSheet.hairlineWidth,
                          borderColor: colors.divider,
                          backgroundColor: colors.surface,
                        }}
                      >
                        <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: accent + '18', alignItems: 'center', justifyContent: 'center' }}>
                          <Icon name={icon} size={14} color={accent} />
                        </View>
                        <Text style={{ fontSize: FontSize.smPlus, fontWeight: FontWeight.semiBold, color: colors.textPrimary }}>{label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* ── Suggestions (contenu populaire + événements à venir) ── */}
                {(popularLoading || popularContent.length > 0) && (
                  <View style={{ paddingTop: 24, paddingBottom: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, marginBottom: 12 }}>
                      <Icon name="trending-up" size={12} color={colors.textTertiary} />
                      <Text style={{ fontSize: FontSize.xsPlus, fontWeight: FontWeight.extraBold, color: colors.textTertiary, letterSpacing: 1, textTransform: 'uppercase' }}>
                        Meilleures suggestions
                      </Text>
                    </View>
                    {popularLoading ? (
                      <View style={{ paddingHorizontal: 16 }}>
                        <ActivityIndicator size="small" color={colors.primary} />
                      </View>
                    ) : (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}>
                        {popularContent.map(item => {
                          const isEvent = item.__kind === 'event';
                          const fmtV = (n: number) => n >= 1000000 ? `${(n / 1000000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(0)}k` : String(n ?? 0);
                          const fmtDate = (iso?: string) => {
                            if (!iso) return null;
                            const d = new Date(iso);
                            return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
                          };
                          return (
                            <TouchableOpacity
                              key={`${item.__kind}-${item.id}`}
                              activeOpacity={0.85}
                              style={{ width: 120 }}
                              onPress={() => {
                                closeSearch();
                                if (isEvent) {
                                  (nav as any).navigate('EventDetail', { eventId: item.id });
                                } else if (item.type === 'serie' || item.content_type === 'serie') {
                                  (nav as any).navigate('SerieEpisodes', { item });
                                } else {
                                  (nav as any).navigate('FilmDetail', { item });
                                }
                              }}
                            >
                              <View style={{ width: 120, height: 170, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.backgroundSecondary }}>
                                {item.thumbnail_url ? (
                                  <Image source={{ uri: item.thumbnail_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                                ) : (
                                  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                                    <Icon name={isEvent ? 'calendar' : 'film'} size={26} color={colors.textTertiary} />
                                  </View>
                                )}
                                <View style={{ position: 'absolute', top: 6, left: 6, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                                  <Text style={{ fontSize: FontSize['2xs'], fontWeight: FontWeight.bold, color: '#fff' }}>{isEvent ? 'Événement' : 'Populaire'}</Text>
                                </View>
                              </View>
                              <Text style={{ fontSize: FontSize.sm, fontWeight: FontWeight.semiBold, color: colors.textPrimary, marginTop: 6 }} numberOfLines={1}>
                                {item.title ?? 'Sans titre'}
                              </Text>
                              {isEvent ? (
                                !!item.starts_at && (
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                                    <Icon name="calendar" size={10} color={colors.textTertiary} />
                                    <Text style={{ fontSize: FontSize.xsPlus, color: colors.textTertiary }}>{fmtDate(item.starts_at)}</Text>
                                  </View>
                                )
                              ) : (
                                !!item.view_count && (
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                                    <Icon name="eye" size={10} color={colors.textTertiary} />
                                    <Text style={{ fontSize: FontSize.xsPlus, color: colors.textTertiary }}>{fmtV(item.view_count)}</Text>
                                  </View>
                                )
                              )}
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    )}
                  </View>
                )}

                {/* Astuce */}
                <View style={{ marginHorizontal: 16, marginTop: 28, borderRadius: 16, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.divider, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary + '18', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="zap" size={18} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: FontSize.smPlus, fontWeight: FontWeight.bold, color: colors.textPrimary }}>Recherche instantanée</Text>
                    <Text style={{ fontSize: FontSize.sm, color: colors.textTertiary, marginTop: 2 }}>Tape un nom, un lieu ou un titre</Text>
                  </View>
                </View>
              </ScrollView>
            );

            // Chargement — avec suggestions historique pendant l'attente API. La pub déjà
            // chargée (searchAd n'est vidée que quand le champ redevient vide, jamais entre
            // deux frappes) reste affichée ici pour ne pas clignoter/disparaître à chaque
            // debounce de 300ms pendant que l'utilisateur tape.
            if (searching) return (
              <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                {searchAd && searchFilter === 'all' && (
                  <View style={{ paddingHorizontal: 12, paddingTop: 10 }}>
                    <AdCard
                      ad={searchAd}
                      colors={colors}
                      searchOverlay
                      onImpression={handleAdImpression}
                      onPress={handleAdPress}
                      onOpenFullscreen={setFullscreenAd}
                    />
                  </View>
                )}
                {historySuggestions.length > 0 && (
                  <View style={{ paddingTop: 8, paddingBottom: 4 }}>
                    <Text style={{ fontSize: FontSize.xsPlus, fontWeight: FontWeight.extraBold, color: colors.textTertiary, letterSpacing: 1, textTransform: 'uppercase', paddingHorizontal: 16, marginBottom: 6 }}>Suggestions</Text>
                    {historySuggestions.map((h) => (
                      <TouchableOpacity
                        key={h.query}
                        activeOpacity={0.7}
                        onPress={() => { setSearchQuery(h.query); setSearchFilter('all'); liveSearch(h.query, 'all'); commitSearch(h.query); }}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider }}
                      >
                        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary + '15', alignItems: 'center', justifyContent: 'center' }}>
                          <Icon name="clock" size={14} color={colors.primary} />
                        </View>
                        <Text style={{ flex: 1, fontSize: FontSize.base, fontWeight: FontWeight.medium, color: colors.textPrimary }} numberOfLines={1}>{h.query}</Text>
                        <Icon name="arrow-up-left" size={14} color={colors.textTertiary} />
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
                <View style={{ alignItems: 'center', paddingTop: historySuggestions.length > 0 ? 24 : 80, gap: 12 }}>
                  <GofolyxLoader color={colors.primary} />
                  <Text style={{ fontSize: FontSize.base, color: colors.textTertiary }}>Recherche en cours...</Text>
                </View>
              </ScrollView>
            );

            // Aucun résultat
            const hasAny = searchResults && (
              (searchResults.users?.length ?? 0) > 0 ||
              (searchResults.films?.length ?? 0) > 0 ||
              (searchResults.series?.length ?? 0) > 0 ||
              (searchResults.concerts?.length ?? 0) > 0 ||
              (searchResults.events?.length ?? 0) > 0 ||
              (searchResults.reels?.length ?? 0) > 0
            );

            if (!hasAny) return (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32 }}>
                <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.backgroundSecondary, alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
                  <Icon name="search" size={30} color={colors.textTertiary} />
                </View>
                <Text style={{ fontSize: FontSize.lg, fontWeight: FontWeight.extraBold, color: colors.textPrimary, textAlign: 'center' }}>Aucun résultat</Text>
                <Text style={{ fontSize: FontSize.base, color: colors.textTertiary, textAlign: 'center', lineHeight: 20 }}>Rien trouvé pour "{searchQuery}". Essaie un autre mot-clé.</Text>
              </View>
            );

            // Filtres chips
            const totalCounts: Record<string, number> = {
              all:      (searchResults!.users?.length ?? 0) + (searchResults!.events?.length ?? 0) + (searchResults!.concerts?.length ?? 0) + (searchResults!.reels?.length ?? 0) + (searchResults!.films?.length ?? 0) + (searchResults!.series?.length ?? 0),
              users:    searchResults!.users?.length ?? 0,
              events:   searchResults!.events?.length ?? 0,
              concerts: searchResults!.concerts?.length ?? 0,
              reels:    searchResults!.reels?.length ?? 0,
              films:    (searchResults!.films?.length ?? 0) + (searchResults!.series?.length ?? 0),
            };

            return (
              <View style={{ flex: 1 }}>
                {/* Suggestions historique au-dessus des résultats */}
                {historySuggestions.length > 0 && (
                  <View style={{ borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider }}>
                    {historySuggestions.map((h) => (
                      <TouchableOpacity
                        key={h.query}
                        activeOpacity={0.7}
                        onPress={() => { setSearchQuery(h.query); setSearchFilter('all'); liveSearch(h.query, 'all'); commitSearch(h.query); }}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider }}
                      >
                        <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primary + '15', alignItems: 'center', justifyContent: 'center' }}>
                          <Icon name="clock" size={13} color={colors.primary} />
                        </View>
                        <Text style={{ flex: 1, fontSize: FontSize.base, fontWeight: FontWeight.medium, color: colors.textPrimary }} numberOfLines={1}>{h.query}</Text>
                        <Icon name="arrow-up-left" size={13} color={colors.textTertiary} />
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {/* Chips filtre — sticky */}
                <View style={{ borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider }}>
                <ScrollView
                  horizontal showsHorizontalScrollIndicator={false}
                  style={{ flexGrow: 0 }}
                  contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 10, gap: 8 }}
                >
                  {CATS.filter(c => c.key === 'all' || totalCounts[c.key] > 0).map(cat => {
                    const active = searchFilter === cat.key;
                    return (
                      <TouchableOpacity
                        key={cat.key}
                        onPress={() => { setSearchFilter(cat.key); liveSearch(searchQuery, cat.key); }}
                        activeOpacity={0.75}
                        style={{
                          flexDirection: 'row', alignItems: 'center', gap: 6,
                          paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
                          backgroundColor: active ? cat.accent : colors.backgroundSecondary,
                          borderWidth: active ? 0 : StyleSheet.hairlineWidth,
                          borderColor: colors.divider,
                        }}
                      >
                        <Icon name={cat.icon} size={13} color={active ? '#fff' : colors.textSecondary} />
                        <Text style={{ fontSize: FontSize.smPlus, fontWeight: FontWeight.bold, color: active ? '#fff' : colors.textSecondary }}>{cat.label}</Text>
                        {totalCounts[cat.key] > 0 && (
                          <View style={{ backgroundColor: active ? 'rgba(255,255,255,0.25)' : cat.accent + '22', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1 }}>
                            <Text style={{ fontSize: FontSize.xs, fontWeight: FontWeight.extraBold, color: active ? '#fff' : cat.accent }}>{totalCounts[cat.key]}</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
                </View>

                <ScrollView
                  contentContainerStyle={{ paddingBottom: 120 }}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  onScroll={({ nativeEvent }) => {
                    const { contentOffset, contentSize, layoutMeasurement } = nativeEvent;
                    if (contentOffset.y + layoutMeasurement.height >= contentSize.height - 300) loadMoreSearch();
                  }}
                  scrollEventThrottle={200}
                >
                  {/* Pub — placement "search", une seule en tête des résultats, seulement
                      quand tous les types sont affichés (pas sur une recherche déjà filtrée). */}
                  {searchAd && searchFilter === 'all' && (
                    <View style={{ paddingHorizontal: 12, paddingTop: 10 }}>
                      <AdCard
                        ad={searchAd}
                        colors={colors}
                        searchOverlay
                        onImpression={handleAdImpression}
                        onPress={handleAdPress}
                        onOpenFullscreen={setFullscreenAd}
                      />
                    </View>
                  )}

                  {/* Utilisateurs */}
                  {(searchFilter === 'all' || searchFilter === 'users') && (searchResults!.users?.length ?? 0) > 0 && (
                    <View>
                      <SrSection icon="users" label="Personnes" count={searchResults!.users!.length} accent="#7B3FF2" />
                      {searchResults!.users!.map((u: any, i: number) => (
                        <SrRow key={u.id} onPress={() => { closeSearch(); (nav as any).navigate('UserProfile', { userId: u.id }); }} last={i === searchResults!.users!.length - 1}>
                          <AvatarWithBadge
                            avatarUrl={u.avatar_url}
                            initials={((u.display_name ?? u.username ?? '?')[0] ?? '?').toUpperCase()}
                            size={52}
                            accentColor="#7B3FF2"
                            isLive={u.is_live}
                          />
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: FontSize.basePlus, fontWeight: FontWeight.bold, color: colors.textPrimary }} numberOfLines={1}>{u.display_name ?? u.username}</Text>
                            <Text style={{ fontSize: FontSize.sm, color: colors.textTertiary, marginTop: 2 }}>@{u.username}</Text>
                          </View>
                          <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.backgroundSecondary, alignItems: 'center', justifyContent: 'center' }}>
                            <Icon name="chevron-right" size={14} color={colors.textDisabled} />
                          </View>
                        </SrRow>
                      ))}
                    </View>
                  )}

                  {/* Événements — grille 9:16 */}
                  {(searchFilter === 'all' || searchFilter === 'events') && (searchResults!.events?.length ?? 0) > 0 && (
                    <View>
                      <SrSection icon="calendar" label="Événements" count={searchResults!.events!.length} accent="#0EA5E9" />
                      <SrGrid>
                        {searchResults!.events!.map((e: any) => (
                          <SrGridCard key={e.id} uri={e.thumbnail_url} icon="calendar" accent="#0EA5E9"
                            title={e.title}
                            sub={[e.type ?? e.event_type, e.venue_city].filter(Boolean).join(' · ') || 'Événement'}
                            onPress={() => { closeSearch(); (nav as any).navigate('EventDetail', { eventId: e.id }); }} />
                        ))}
                      </SrGrid>
                    </View>
                  )}

                  {/* Concerts — grille 9:16 */}
                  {(searchFilter === 'all' || searchFilter === 'concerts') && (searchResults!.concerts?.length ?? 0) > 0 && (
                    <View>
                      <SrSection icon="music" label="Concerts" count={searchResults!.concerts!.length} accent="#E0389A" />
                      <SrGrid>
                        {searchResults!.concerts!.map((c: any) => (
                          <SrGridCard key={c.id} uri={c.thumbnail_url} icon="music" accent="#E0389A"
                            title={c.title}
                            sub={[c.genre, c.venue_city].filter(Boolean).join(' · ') || 'Concert'}
                            onPress={() => { closeSearch(); (nav as any).navigate('ConcertDetail', { concertId: c.id }); }} />
                        ))}
                      </SrGrid>
                    </View>
                  )}

                  {/* Reels — grille 9:16 */}
                  {(searchFilter === 'all' || searchFilter === 'reels') && (searchResults!.reels?.length ?? 0) > 0 && (
                    <View>
                      <SrSection icon="video" label="Reels" count={searchResults!.reels!.length} accent="#10B981" />
                      <SrGrid>
                        {searchResults!.reels!.map((r: any) => (
                          <SrGridCard key={r.id} uri={r.thumbnail_url} icon="play" accent="#10B981"
                            title={r.caption ?? 'Reel'}
                            sub={`${(r.view_count ?? 0).toLocaleString('fr')} vues`}
                            onPress={() => {
                              closeSearch();
                              const authorId = r.user_id ?? r.author_id ?? r.author?.id;
                              (nav as any).navigate('SearchReelViewer', { reel: r, reelId: r.id, authorId });
                            }} />
                        ))}
                      </SrGrid>
                    </View>
                  )}

                  {/* Films — grille 9:16 */}
                  {(searchFilter === 'all' || searchFilter === 'films') && (searchResults!.films?.length ?? 0) > 0 && (
                    <View>
                      <SrSection icon="film" label="Films" count={searchResults!.films!.length} accent="#F59E0B" />
                      <SrGrid>
                        {searchResults!.films!.map((c: any) => (
                          <SrGridCard key={c.id} uri={c.thumbnail_url} icon="film" accent="#F59E0B"
                            title={c.title} sub={c.year ? String(c.year) : 'Film'}
                            onPress={() => { closeSearch(); (nav as any).navigate('FilmDetail', { item: c }); }} />
                        ))}
                      </SrGrid>
                    </View>
                  )}

                  {/* Séries — grille 9:16 */}
                  {(searchFilter === 'all' || searchFilter === 'films') && (searchResults!.series?.length ?? 0) > 0 && (
                    <View>
                      <SrSection icon="tv" label="Séries" count={searchResults!.series!.length} accent="#6366F1" />
                      <SrGrid>
                        {searchResults!.series!.map((c: any) => (
                          <SrGridCard key={c.id} uri={c.thumbnail_url} icon="tv" accent="#6366F1"
                            title={c.title} sub={`Série${c.year ? ` · ${c.year}` : ''}`}
                            onPress={() => { closeSearch(); (nav as any).navigate('FilmDetail', { item: c }); }} />
                        ))}
                      </SrGrid>
                    </View>
                  )}

                  {/* Indicateur de chargement — scroll infini sur le filtre actif */}
                  {loadingMoreSearch && (
                    <ActivityIndicator color={colors.primary} style={{ marginVertical: 20 }} />
                  )}
                </ScrollView>
              </View>
            );
          })()}
        </Animated.View>

        {/* Pub vidéo ouverte en plein écran avec son — clic sur une AdCard vidéo
            de l'overlay. */}
        <Modal visible={!!fullscreenAd} animationType="slide" onRequestClose={() => setFullscreenAd(null)} statusBarTranslucent>
          {fullscreenAd && <AdFullscreenPlayer ad={fullscreenAd} onClose={() => setFullscreenAd(null)} />}
        </Modal>
      </View>
    </Modal>
  );
};
