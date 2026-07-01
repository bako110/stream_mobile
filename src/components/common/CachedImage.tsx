/**
 * CachedImage — remplacement direct de <Image source={{uri}}> avec cache disque.
 * Affiche l'URL distante immédiatement (pas de flash), puis bascule sur le fichier
 * local dès qu'il est en cache, et lance le téléchargement en arrière-plan sinon.
 */
import React, { useEffect, useState } from 'react';
import { Image, type ImageProps, type ImageStyle, type StyleProp } from 'react-native';
import { getCachedUri, cacheImage } from '../../services/imageCacheService';

interface CachedImageProps extends Omit<ImageProps, 'source'> {
  uri: string | undefined | null;
  style?: StyleProp<ImageStyle>;
}

export const CachedImage: React.FC<CachedImageProps> = ({ uri, ...rest }) => {
  const [localUri, setLocalUri] = useState<string | null>(() => (uri ? getCachedUri(uri) : null));

  useEffect(() => {
    if (!uri) { setLocalUri(null); return; }
    const cached = getCachedUri(uri);
    if (cached) { setLocalUri(cached); return; }

    setLocalUri(null);
    let cancelled = false;
    cacheImage(uri).then(path => {
      if (!cancelled && path) setLocalUri(path);
    });
    return () => { cancelled = true; };
  }, [uri]);

  if (!uri) return null;

  return <Image {...rest} source={{ uri: localUri ?? uri }} />;
};
