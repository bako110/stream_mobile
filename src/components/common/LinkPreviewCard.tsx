import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Linking, ActivityIndicator, Image,
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

// Normalise la réponse du backend : le champ image peut arriver sous plusieurs
// noms selon la source (image, image_url, og_image, thumbnail_url, ...), et
// parfois en URL relative → on la résout par rapport à l'URL de la page.
function normalizePreview(raw: any, pageUrl: string): Preview {
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = raw?.[k];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return null;
  };

  let image =
    pick('image', 'image_url', 'og_image', 'ogImage', 'thumbnail', 'thumbnail_url', 'preview_image') ??
    // certains backends imbriquent : { og: { image: ... } } ou { images: [...] }
    (typeof raw?.og?.image === 'string' ? raw.og.image : null) ??
    (Array.isArray(raw?.images) && typeof raw.images[0] === 'string' ? raw.images[0] : null);

  if (image) {
    // Protocol-relative //cdn.site.com/x.jpg → https:
    if (image.startsWith('//')) image = 'https:' + image;
    // Relative /x.jpg ou x.jpg → absolue via la page
    else if (!/^https?:\/\//i.test(image)) {
      try { image = new URL(image, pageUrl).href; } catch { image = null; }
    }
  }

  const domain = (() => {
    const d = pick('domain', 'site', 'host');
    if (d) return d;
    try { return new URL(pageUrl).hostname; } catch { return ''; }
  })();

  return {
    title:       pick('title', 'og_title', 'ogTitle', 'name'),
    description: pick('description', 'og_description', 'ogDescription', 'summary', 'excerpt'),
    image,
    domain,
    site_name:   pick('site_name', 'siteName', 'og_site_name', 'publisher'),
  };
}

export const LinkPreviewCard: React.FC<Props> = ({ url }) => {
  const { theme: { colors } } = useTheme();

  // undefined = en cours, null = erreur/vide, Preview = données
  const [preview, setPreview] = useState<Preview | null | undefined>(
    _cache.has(url) ? _cache.get(url) : undefined,
  );
  // Nombre d'échecs de chargement d'image — on ne masque qu'après 2 essais
  // (le 1er onError est souvent un faux négatif : cache disque pas encore prêt).
  const [imgFail, setImgFail] = useState(0);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current || _cache.has(url)) return;
    fetchedRef.current = true;
    apiClient
      .get(Endpoints.utils.linkPreview(url))
      .then((r: any) => {
        const raw = r?.data ?? r;
        const data = normalizePreview(raw, url);
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

  const showImage = !!preview?.image && imgFail < 2;

  // ── Chargement — squelette compact (jamais de grand vide) ──────────────────
  if (preview === undefined) {
    return (
      <View style={[st.card, st.compact, { borderColor: colors.divider, backgroundColor: colors.surface }]}>
        <View style={[st.domainIcon, { backgroundColor: colors.primary + '18' }]}>
          <Icon name="link-2" size={13} color={colors.primary} />
        </View>
        <View style={{ flex: 1, gap: 5 }}>
          <View style={{ height: 10, width: '45%', borderRadius: 4, backgroundColor: colors.skeleton }} />
          <View style={{ height: 12, width: '80%', borderRadius: 4, backgroundColor: colors.skeleton }} />
        </View>
        <ActivityIndicator size="small" color={colors.textTertiary} />
      </View>
    );
  }

  // ── Ni titre ni image exploitable — barre compacte (juste le domaine) ──────
  if (!preview?.title && !showImage) {
    return (
      <TouchableOpacity
        style={[st.card, st.compact, { borderColor: colors.divider, backgroundColor: colors.surface }]}
        onPress={handlePress}
        activeOpacity={0.8}
      >
        <View style={[st.domainIcon, { backgroundColor: colors.primary + '18' }]}>
          <Icon name="globe" size={13} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[st.compactDomain, { color: colors.textTertiary }]} numberOfLines={1}>
            {(preview?.site_name || domain).toUpperCase()}
          </Text>
          <Text style={[st.compactUrl, { color: colors.primary }]} numberOfLines={1}>
            {url.replace(/^https?:\/\/(www\.)?/, '')}
          </Text>
        </View>
        <Icon name="external-link" size={14} color={colors.textTertiary} />
      </TouchableOpacity>
    );
  }

  // ── Carte riche — image OG en haut, puis domaine / titre / description ─────
  return (
    <TouchableOpacity
      style={[st.card, { borderColor: colors.divider, backgroundColor: colors.surface }]}
      onPress={handlePress}
      activeOpacity={0.9}
    >
      {showImage ? (
        <View style={[st.imageWrap, { backgroundColor: colors.skeleton }]}>
          {/* Image OG chargée directement (pas via cache disque) — une URL OG est
              souvent un CDN avec paramètres signés que le cache gère mal, et on
              veut l'afficher au plus vite. */}
          <Image
            source={{ uri: preview!.image! }}
            style={st.image}
            resizeMode="cover"
            onError={() => setImgFail(n => n + 1)}
          />
          {/* Filet : si l'image met du temps, on garde un fond skeleton visible */}
        </View>
      ) : null}

      <View style={st.body}>
        <Text style={[st.domainLabel, { color: colors.textTertiary }]} numberOfLines={1}>
          {(preview?.site_name || domain).toUpperCase()}
        </Text>
        {preview?.title ? (
          <Text style={[st.title, { color: colors.textPrimary }]} numberOfLines={2}>
            {preview.title}
          </Text>
        ) : null}
        {preview?.description ? (
          <Text style={[st.desc, { color: colors.textSecondary }]} numberOfLines={showImage ? 2 : 3}>
            {preview.description}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
};

const st = StyleSheet.create({
  card:            { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, overflow: 'hidden' },
  compact:         { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10 },
  domainIcon:      { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  compactDomain:   { fontSize: 9.5, fontWeight: '700', letterSpacing: 0.4 },
  compactUrl:      { fontSize: 13, fontWeight: '600', marginTop: 1 },

  imageWrap:       { width: '100%', aspectRatio: 1.91 },  // ratio Open Graph standard
  image:           { width: '100%', height: '100%' },
  body:            { paddingHorizontal: 12, paddingVertical: 11, gap: 3 },
  domainLabel:     { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  title:           { fontSize: 14, fontWeight: '700', lineHeight: 19 },
  desc:            { fontSize: 12.5, lineHeight: 17, marginTop: 1 },
});
