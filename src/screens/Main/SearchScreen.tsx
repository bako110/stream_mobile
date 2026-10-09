/**
 * SearchScreen — écran de recherche autonome, accessible en navigation depuis
 * n'importe quel écran (contrairement à la barre de recherche intégrée dans
 * FeedScreen, limitée à l'onglet Accueil). Sert notamment de cible aux
 * #hashtags et @mentions cliqués dans un texte (RichText), qui doivent
 * pouvoir s'ouvrir depuis un post, un commentaire ou un reel.
 *
 * Version volontairement minimale — pas d'historique, de pub ni de
 * suggestions populaires (ces extras restent propres à l'overlay de
 * FeedScreen) : champ de recherche + résultats multi-catégories + navigation
 * vers le profil/contenu correspondant.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import LinearGradient from 'react-native-linear-gradient';
import { useTheme } from '../../hooks/useTheme';
import { AppHeader } from '../../components/common/AppHeader';
import { CachedImage, GofolyxLoader } from '../../components/common';
import { searchService } from '../../services/searchService';
import { FontSize, FontWeight } from '../../theme';
import type { SearchResults } from '../../types';

interface Props {
  route?: { params?: { query?: string } };
  navigation: any;
}

const SEARCH_PAGE_LIMIT = 20;

export const SearchScreen: React.FC<Props> = ({ route, navigation }) => {
  const { theme } = useTheme();
  const { colors } = theme;

  const initialQuery = route?.params?.query ?? '';
  const [query,     setQuery]     = useState(initialQuery);
  const [results,   setResults]   = useState<SearchResults | null>(null);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const reqRef   = useRef('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback((term: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const trimmed = term.trim();
    reqRef.current = trimmed;
    if (!trimmed) { setResults(null); setSearching(false); return; }
    timerRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await searchService.searchAll({ q: trimmed, limit: SEARCH_PAGE_LIMIT });
        if (reqRef.current === trimmed) setResults(res);
      } catch { /* silencieux */ }
      finally { if (reqRef.current === trimmed) setSearching(false); }
    }, 300);
  }, []);

  // Recherche immédiate si un terme initial est fourni (arrivée depuis un #hashtag/@mention)
  useEffect(() => {
    if (initialQuery.trim()) runSearch(initialQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goProfile = (userId: string) => navigation.navigate('UserProfile', { userId });
  const goEvent   = (eventId: string) => navigation.navigate('EventDetail', { eventId });
  const goConcert = (concertId: string) => navigation.navigate('ConcertDetail', { concertId });
  const goReel    = (reel: any) => navigation.navigate('SearchReelViewer', { reel });
  const goFilm    = (item: any) => navigation.navigate('FilmDetail', { item });

  const SrThumb = ({ uri, icon, accent, round }: { uri?: string | null; icon: string; accent: string; round?: boolean }) =>
    uri ? (
      <CachedImage uri={uri} style={{ width: 52, height: 52, borderRadius: round ? 26 : 12 }} />
    ) : (
      <View style={{ width: 52, height: 52, borderRadius: round ? 26 : 12, backgroundColor: accent + '20', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={20} color={accent} />
      </View>
    );

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

  const hasAny = results && (
    (results.users?.length ?? 0) > 0 ||
    (results.films?.length ?? 0) > 0 ||
    (results.series?.length ?? 0) > 0 ||
    (results.concerts?.length ?? 0) > 0 ||
    (results.events?.length ?? 0) > 0 ||
    (results.reels?.length ?? 0) > 0
  );

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      {/* Header — composant partagé AppHeader (même carte flottante que le reste de l'app) */}
      <AppHeader
        onBack={() => navigation.goBack()}
        centerContent={
          <View style={[s.searchBar, { backgroundColor: colors.backgroundSecondary, borderColor: colors.primary + '55' }]}>
            <Icon name="search" size={14} color={colors.primary} />
            <TextInput
              ref={inputRef}
              autoFocus
              placeholder="Rechercher..."
              placeholderTextColor={colors.textDisabled}
              style={{ flex: 1, fontSize: FontSize.base, color: colors.textPrimary, padding: 0, marginLeft: 8 }}
              returnKeyType="search"
              value={query}
              onChangeText={(text) => { setQuery(text); runSearch(text); }}
              onSubmitEditing={() => runSearch(query)}
            />
            {searching && <ActivityIndicator size="small" color={colors.primary} />}
            {query.length > 0 && !searching && (
              <TouchableOpacity onPress={() => { setQuery(''); setResults(null); }}>
                <Icon name="x-circle" size={14} color={colors.textTertiary} />
              </TouchableOpacity>
            )}
          </View>
        }
      />

      {/* Résultats */}
      {!query.trim() && !results ? (
        <View style={s.emptyState}>
          <Icon name="search" size={32} color={colors.textTertiary} />
          <Text style={{ fontSize: FontSize.base, color: colors.textTertiary, marginTop: 12 }}>
            Tape un nom, un lieu ou un titre
          </Text>
        </View>
      ) : searching && !results ? (
        <View style={s.emptyState}>
          <GofolyxLoader color={colors.primary} />
          <Text style={{ fontSize: FontSize.base, color: colors.textTertiary, marginTop: 12 }}>Recherche en cours...</Text>
        </View>
      ) : !hasAny ? (
        <View style={s.emptyState}>
          <Icon name="frown" size={32} color={colors.textTertiary} />
          <Text style={{ fontSize: FontSize.base, color: colors.textTertiary, marginTop: 12 }}>Aucun résultat pour « {query} »</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          {(results!.users?.length ?? 0) > 0 && (
            <View>
              <SrSection icon="users" label="Personnes" count={results!.users!.length} accent="#7B3FF2" />
              {results!.users!.map((u, i) => (
                <SrRow key={u.id} onPress={() => goProfile(u.id)} last={i === results!.users!.length - 1}>
                  <SrThumb uri={u.avatar_url} icon="user" accent="#7B3FF2" round />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontSize: FontSize.base, fontWeight: FontWeight.bold, color: colors.textPrimary }} numberOfLines={1}>
                      {u.display_name || `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || u.username}
                    </Text>
                    <Text style={{ fontSize: FontSize.sm, color: colors.textTertiary }} numberOfLines={1}>@{u.username}</Text>
                  </View>
                </SrRow>
              ))}
            </View>
          )}

          {(results!.events?.length ?? 0) > 0 && (
            <View>
              <SrSection icon="calendar" label="Événements" count={results!.events!.length} accent="#0EA5E9" />
              {results!.events!.map((e: any, i: number) => (
                <SrRow key={e.id} onPress={() => goEvent(e.id)} last={i === results!.events!.length - 1}>
                  <SrThumb uri={e.thumbnail_url} icon="calendar" accent="#0EA5E9" />
                  <Text style={{ flex: 1, fontSize: FontSize.base, fontWeight: FontWeight.bold, color: colors.textPrimary }} numberOfLines={1}>{e.title}</Text>
                </SrRow>
              ))}
            </View>
          )}

          {(results!.concerts?.length ?? 0) > 0 && (
            <View>
              <SrSection icon="music" label="Concerts" count={results!.concerts!.length} accent="#E0389A" />
              {results!.concerts!.map((c: any, i: number) => (
                <SrRow key={c.id} onPress={() => goConcert(c.id)} last={i === results!.concerts!.length - 1}>
                  <SrThumb uri={c.thumbnail_url} icon="music" accent="#E0389A" />
                  <Text style={{ flex: 1, fontSize: FontSize.base, fontWeight: FontWeight.bold, color: colors.textPrimary }} numberOfLines={1}>{c.title}</Text>
                </SrRow>
              ))}
            </View>
          )}

          {(results!.reels?.length ?? 0) > 0 && (
            <View>
              <SrSection icon="video" label="Reels" count={results!.reels!.length} accent="#10B981" />
              {results!.reels!.map((r: any, i: number) => (
                <SrRow key={r.id} onPress={() => goReel(r)} last={i === results!.reels!.length - 1}>
                  <SrThumb uri={r.thumbnail_url} icon="video" accent="#10B981" />
                  <Text style={{ flex: 1, fontSize: FontSize.base, fontWeight: FontWeight.bold, color: colors.textPrimary }} numberOfLines={1}>{r.caption || 'Reel'}</Text>
                </SrRow>
              ))}
            </View>
          )}

          {((results!.films?.length ?? 0) + (results!.series?.length ?? 0)) > 0 && (
            <View>
              <SrSection icon="film" label="Films & séries" count={(results!.films?.length ?? 0) + (results!.series?.length ?? 0)} accent="#F59E0B" />
              {[...(results!.films ?? []), ...(results!.series ?? [])].map((item: any, i: number, arr: any[]) => (
                <SrRow key={item.id} onPress={() => goFilm(item)} last={i === arr.length - 1}>
                  <SrThumb uri={item.thumbnail_url} icon="film" accent="#F59E0B" />
                  <Text style={{ flex: 1, fontSize: FontSize.base, fontWeight: FontWeight.bold, color: colors.textPrimary }} numberOfLines={1}>{item.title}</Text>
                </SrRow>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
};

const s = StyleSheet.create({
  root: { flex: 1 },
  searchBar: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, height: 38,
    borderRadius: 19, borderWidth: 1,
  },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
});
