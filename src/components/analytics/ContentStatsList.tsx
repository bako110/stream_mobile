/**
 * ContentStatsList — liste des contenus du créateur triés par vues, tap →
 * ouvre le détail analytics de ce contenu précis (ContentAnalyticsDetailScreen).
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import type { ContentStatItem, AnalyticsContentType } from '../../services/analyticsService';

const TYPE_ICON: Record<AnalyticsContentType, string> = {
  reel: 'video', post: 'file-text', event: 'calendar', concert: 'music', live: 'radio',
};
const TYPE_LABEL: Record<AnalyticsContentType, string> = {
  reel: 'Reel', post: 'Post', event: 'Événement', concert: 'Concert', live: 'Live',
};

interface Props {
  items: ContentStatItem[];
  onPressItem: (item: ContentStatItem) => void;
}

export const ContentStatsList: React.FC<Props> = ({ items, onPressItem }) => (
  <View style={{ gap: 2 }}>
    {items.map((item, i) => (
      <TouchableOpacity
        key={`${item.content_type}:${item.content_id}`}
        onPress={() => onPressItem(item)}
        activeOpacity={0.7}
        style={[s.row, i < items.length - 1 && s.rowBorder]}
      >
        {item.thumbnail_url ? (
          <Image source={{ uri: item.thumbnail_url }} style={s.thumb} />
        ) : (
          <View style={[s.thumb, s.thumbFallback]}>
            <Icon name={TYPE_ICON[item.content_type] as any} size={16} color="#9CA3AF" />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={s.title} numberOfLines={1}>{item.title ?? TYPE_LABEL[item.content_type]}</Text>
          <Text style={s.subtitle}>{TYPE_LABEL[item.content_type]}</Text>
        </View>
        <View style={s.viewsWrap}>
          <Icon name="eye" size={12} color="#9CA3AF" />
          <Text style={s.views}>{item.views.toLocaleString('fr-FR')}</Text>
        </View>
        <Icon name="chevron-right" size={16} color="#D1D5DB" />
      </TouchableOpacity>
    ))}
  </View>
);

const s = StyleSheet.create({
  row:          { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  rowBorder:    { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(120,120,120,0.15)' },
  thumb:        { width: 40, height: 40, borderRadius: 8 },
  thumbFallback:{ backgroundColor: 'rgba(120,120,120,0.12)', alignItems: 'center', justifyContent: 'center' },
  title:        { fontSize: 13, fontWeight: '700', color: '#111' },
  subtitle:     { fontSize: 11, color: '#9CA3AF', marginTop: 1 },
  viewsWrap:    { flexDirection: 'row', alignItems: 'center', gap: 4 },
  views:        { fontSize: 12, fontWeight: '700', color: '#6B7280' },
});
