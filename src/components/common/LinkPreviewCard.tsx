import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, Image, TouchableOpacity, StyleSheet, Linking, ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../../hooks/useTheme';
import { apiClient } from '../../api/client';
import { Endpoints } from '../../api/endpoints';

interface Preview {
  title: string | null;
  description: string | null;
  image: string | null;
  domain: string;
  site_name: string | null;
}

// Cache en mémoire — évite de refetch à chaque render
const _cache = new Map<string, Preview | null>();

interface Props {
  url: string;
}

export const LinkPreviewCard: React.FC<Props> = ({ url }) => {
  const { theme: { colors } } = useTheme();

  // undefined = en cours, null = erreur/vide, Preview = données
  const [preview, setPreview] = useState<Preview | null | undefined>(
    _cache.has(url) ? _cache.get(url) : undefined,
  );
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current || _cache.has(url)) return;
    fetchedRef.current = true;
    apiClient
      .get(Endpoints.utils.linkPreview(url))
      .then((r: any) => {
        const data: Preview = r.data ?? r;
        _cache.set(url, data);
        setPreview(data);
      })
      .catch(() => {
        const domain = (() => { try { return new URL(url).hostname; } catch { return ''; } })();
        const fallback: Preview = { title: null, description: null, image: null, domain, site_name: null };
        _cache.set(url, fallback);
        setPreview(fallback);
      });
  }, [url]);

  const handlePress = () => Linking.openURL(url).catch(() => {});

  const domain = (() => {
    try { return (preview?.domain || new URL(url).hostname).replace(/^www\./, ''); }
    catch { return url; }
  })();

  // Chargement
  if (preview === undefined) {
    return (
      <View style={[st.card, { borderColor: colors.divider, backgroundColor: colors.surface }]}>
        <View style={st.loadingRow}>
          <View style={[st.loadingIcon, { backgroundColor: colors.primary + '18' }]}>
            <Icon name="globe" size={13} color={colors.primary} />
          </View>
          <ActivityIndicator size="small" color={colors.textTertiary} />
        </View>
      </View>
    );
  }

  // Pas d'image ni titre — version compacte (juste le domaine)
  if (!preview?.title && !preview?.image) {
    return (
      <TouchableOpacity
        style={[st.card, st.compact, { borderColor: colors.divider, backgroundColor: colors.surface }]}
        onPress={handlePress}
        activeOpacity={0.8}
      >
        <View style={[st.domainIcon, { backgroundColor: colors.primary + '18' }]}>
          <Icon name="globe" size={13} color={colors.primary} />
        </View>
        <Text style={[st.domainTextCompact, { color: colors.primary }]} numberOfLines={1}>
          {domain}
        </Text>
        <Icon name="external-link" size={13} color={colors.textTertiary} />
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={[st.card, { borderColor: colors.divider, backgroundColor: colors.surface }]}
      onPress={handlePress}
      activeOpacity={0.85}
    >
      {/* Image Open Graph */}
      {preview.image ? (
        <Image source={{ uri: preview.image }} style={st.image} resizeMode="cover" />
      ) : null}

      {/* Corps */}
      <View style={st.body}>
        <View style={st.domainRow}>
          <Icon name="globe" size={10} color={colors.textTertiary} />
          <Text style={[st.domainLabel, { color: colors.textTertiary }]} numberOfLines={1}>
            {preview.site_name || domain}
          </Text>
        </View>
        {preview.title ? (
          <Text style={[st.title, { color: colors.textPrimary }]} numberOfLines={2}>
            {preview.title}
          </Text>
        ) : null}
        {preview.description ? (
          <Text style={[st.desc, { color: colors.textSecondary }]} numberOfLines={2}>
            {preview.description}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
};

const st = StyleSheet.create({
  card:            { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, marginTop: 8, overflow: 'hidden' },
  compact:         { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
  loadingRow:      { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  loadingIcon:     { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  domainIcon:      { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  domainTextCompact: { flex: 1, fontSize: 13, fontWeight: '600' },
  image:           { width: '100%', height: 180 },
  body:            { padding: 10, gap: 3 },
  domainRow:       { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
  domainLabel:     { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.3 },
  title:           { fontSize: 14, fontWeight: '700', lineHeight: 19 },
  desc:            { fontSize: 12, lineHeight: 17 },
});
