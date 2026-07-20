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
  // Trace l'uri distante représentée par le localUri actuel — permet de distinguer un
  // vrai changement d'image (reset nécessaire) d'un simple remontage du composant avec
  // la MÊME uri (scroll rapide qui le fait sortir/rentrer de la fenêtre de rendu FlatList).
  const resolvedForUriRef = React.useRef<string | null>(uri ?? null);

  useEffect(() => {
    if (!uri) { setLocalUri(null); resolvedForUriRef.current = null; return; }

    const cached = getCachedUri(uri);
    if (cached) { setLocalUri(cached); resolvedForUriRef.current = uri; return; }

    // Uri différente de celle déjà résolue → vraie nouvelle image, reset nécessaire.
    // Uri identique (remontage) → on garde l'affichage courant, pas de flash "vide" pendant
    // que cacheImage() re-vérifie le disque.
    if (resolvedForUriRef.current !== uri) { setLocalUri(null); resolvedForUriRef.current = uri; }

    let cancelled = false;
    cacheImage(uri).then(path => {
      if (!cancelled && path) { setLocalUri(path); resolvedForUriRef.current = uri; }
    });
    return () => { cancelled = true; };
  }, [uri]);

  if (!uri) return null;

  return <Image {...rest} source={{ uri: localUri ?? uri }} />;
};
