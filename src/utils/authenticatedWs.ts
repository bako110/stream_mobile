// Ouvre un WebSocket et envoie le token JWT dans le premier message plutôt
// qu'en query string (qui finirait dans les logs d'accès des proxys/CDN
// intermédiaires). Le serveur ferme la connexion s'il ne reçoit pas ce
// message d'auth dans les ~10s suivant l'ouverture.
export function openAuthenticatedWs(url: string, token: string): WebSocket {
  const ws = new WebSocket(url);
  ws.addEventListener('open', () => {
    ws.send(JSON.stringify({ type: 'auth', token }));
  });
  return ws;
}
