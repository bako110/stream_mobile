// Endpoints alignés exactement sur app/main.py — prefix /api/v1
// NOTE: API_BASE_URL est ajouté par apiClient dans client.ts — ne pas le répéter ici
const V1 = '/api/v1';

export const Endpoints = {
  // ── Auth  (prefix: /api/v1/auth) ──────────────────────────────────────────
  auth: {
    register:       `${V1}/auth/register`,
    login:          `${V1}/auth/login`,
    refresh:        `${V1}/auth/refresh`,
    logout:         `${V1}/auth/logout`,
    me:             `${V1}/auth/me`,
    changePassword: `${V1}/auth/me/password`,
    oauthGoogle:    `${V1}/auth/oauth/google`,
    oauthFacebook:  `${V1}/auth/oauth/facebook`,
    forgotPassword: `${V1}/auth/forgot-password`,
    resetPassword:  `${V1}/auth/reset-password`,
    qrGenerate:     `${V1}/auth/qr/generate`,
    qrVerify:       `${V1}/auth/qr/verify`,
    qrStatus:       (token: string) => `${V1}/auth/qr/status/${token}`,
    webQrScan:      `${V1}/auth/web-qr/scan`,
  },

  // ── Users (prefix: /api/v1/users) ─────────────────────────────────────────
  users: {
    me:             `${V1}/users/me`,
    updateMe:       `${V1}/users/me`,
    watchHistory:   `${V1}/users/me/history`,
    publicProfile:  (id: string) => `${V1}/users/${id}/profile`,
    userReels:      (id: string) => `${V1}/users/${id}/reels`,
    userEvents:     (id: string) => `${V1}/users/${id}/events`,
    userConcerts:   (id: string) => `${V1}/users/${id}/concerts`,
    follow:         (id: string) => `${V1}/users/${id}/follow`,
    followers:      (id: string) => `${V1}/users/${id}/followers`,
    following:      (id: string) => `${V1}/users/${id}/following`,
    block:          (id: string) => `${V1}/users/${id}/block`,
    blocked:        `${V1}/users/me/blocked`,
    suggestions:    `${V1}/users/suggestions`,
    verificationStatus:  `${V1}/users/me/verification`,
    verifyRequest:       `${V1}/users/me/verify-request`,
    adminVerify: (id: string) => `${V1}/users/${id}/verify`,
    privacy:        `${V1}/users/me/privacy`,
    // Admin
    matchContacts:  `${V1}/users/match-contacts`,
    list:           `${V1}/users`,
    changeRole:     (id: string) => `${V1}/users/${id}/role`,
    deactivate:     (id: string) => `${V1}/users/${id}/deactivate`,
    activate:       (id: string) => `${V1}/users/${id}/activate`,
    delete:         (id: string) => `${V1}/users/${id}`,
  },

  // ── Content (prefix: /api/v1/content) ─────────────────────────────────────
  content: {
    dashboard:    `${V1}/content/dashboard`,
    allAdmin:     `${V1}/content/all`,
    // Films
    films:        `${V1}/content/films`,
    filmById:     (id: string) => `${V1}/content/films/${id}`,
    publishFilm:  (id: string) => `${V1}/content/films/${id}/publish`,
    // Séries
    series:       `${V1}/content/series`,
    serieById:    (id: string) => `${V1}/content/series/${id}`,
    publishSerie: (id: string) => `${V1}/content/series/${id}/publish`,
  },

  // ── Seasons (prefix: /api/v1/content) ─────────────────────────────────────
  seasons: {
    bySerie:  (contentId: string) => `${V1}/content/series/${contentId}/seasons`,
    byNumber: (contentId: string, number: number) =>
                `${V1}/content/series/${contentId}/seasons/${number}`,
  },

  // ── Episodes (prefix: /api/v1) ─────────────────────────────────────────────
  episodes: {
    bySeason: (contentId: string, seasonNumber: number) =>
                `${V1}/content/series/${contentId}/seasons/${seasonNumber}/episodes`,
    byId:     (episodeId: string) => `${V1}/episodes/${episodeId}`,
  },

  // ── Videos (prefix: /api/v1) ──────────────────────────────────────────────
  videos: {
    byContent: (contentId: string)  => `${V1}/content/${contentId}/videos`,
    byEpisode: (episodeId: string)  => `${V1}/episodes/${episodeId}/videos`,
    byId:      (id: string)         => `${V1}/videos/${id}`,
    uploadUrl: `${V1}/videos/upload-url`,
  },

  // ── Concerts (prefix: /api/v1/concerts) ───────────────────────────────────
  concerts: {
    list:       `${V1}/concerts`,
    me:         `${V1}/concerts/me`,
    live:       `${V1}/concerts/live`,
    upcoming:   `${V1}/concerts/upcoming`,
    adminAll:   `${V1}/concerts/admin/all`,
    byId:       (id: string) => `${V1}/concerts/${id}`,
    publish:    (id: string) => `${V1}/concerts/${id}/publish`,
    startLive:  (id: string) => `${V1}/concerts/${id}/start-live`,
    endLive:    (id: string) => `${V1}/concerts/${id}/end-live`,
    // Billets concert
    buyTicket:       (concertId: string) => `${V1}/concerts/${concertId}/tickets`,
    myTickets:       `${V1}/concerts/tickets/me`,
    validateTicket:  (ticketId: string)  => `${V1}/concerts/tickets/${ticketId}/validate`,
  },

  // ── Streaming LiveKit (prefix: /api/v1/stream) ─────────────────────────────
  streaming: {
    token:     (concertId: string) => `${V1}/stream/${concertId}/token`,
    start:     (concertId: string) => `${V1}/stream/${concertId}/start`,
    stop:      (concertId: string) => `${V1}/stream/${concertId}/stop`,
    status:    (concertId: string) => `${V1}/stream/${concertId}/status`,
    analytics: (concertId: string) => `${V1}/stream/${concertId}/analytics`,
    // VOD progress
    progress:  (videoId: string) => `${V1}/stream/${videoId}/progress`,
  },

  // ── Events (prefix: /api/v1/events) ───────────────────────────────────────
  events: {
    list:      `${V1}/events`,
    me:        `${V1}/events/me`,
    byId:      (id: string) => `${V1}/events/${id}`,
    publish:   (id: string) => `${V1}/events/${id}/publish`,
    // Rappel + masquer (feed_actions router)
    remind:    (id: string) => `${V1}/events/${id}/remind`,
    hide:      (id: string) => `${V1}/events/${id}/hide`,
    // Billets événement
    buyTicket:      (eventId: string)  => `${V1}/events/${eventId}/tickets`,
    myTickets:      `${V1}/events/tickets/me`,
    validateTicket: (ticketId: string) => `${V1}/events/tickets/${ticketId}/validate`,
    attendees:      (eventId: string)  => `${V1}/events/${eventId}/attendees`,
    attendeesCsv:   (eventId: string)  => `${V1}/events/${eventId}/attendees/export`,
    scanTicket:     (eventId: string, accessCode: string) => `${V1}/events/${eventId}/scan/${accessCode}`,
    validateByQr:   (eventId: string, accessCode: string) => `${V1}/events/${eventId}/scan/${accessCode}/validate`,
  },

  // ── Reels (prefix: /api/v1/reels) ─────────────────────────────────────────
  reels: {
    feed:      `${V1}/reels`,
    byId:      (id: string) => `${V1}/reels/${id}`,
    view:      (id: string) => `${V1}/reels/${id}/view`,
    byUser:    (userId: string) => `${V1}/reels/user/${userId}`,
    update:    (id: string) => `${V1}/reels/${id}`,
    delete:    (id: string) => `${V1}/reels/${id}`,
  },

  // ── Social (prefix: /api/v1/social) ───────────────────────────────────────
  social: {
    // Commentaires
    comments:        `${V1}/social/comments`,
    commentById:     (id: string) => `${V1}/social/comments/${id}`,
    commentReplies:  (id: string) => `${V1}/social/comments/${id}/replies`,
    // WebSocket commentaires
    commentsWs: (targetType: string, targetId: string) =>
      `/api/v1/social/comments/ws/${targetType}/${targetId}`,
    // Réactions
    toggleReaction:  `${V1}/social/reactions`,
    myReaction:      `${V1}/social/reactions/me`,
    reactionCounts:  `${V1}/social/reactions/counts`,
    // Partages
    share:           `${V1}/social/shares`,
    shareCounts:     `${V1}/social/shares/counts`,
  },

  // ── Posts (prefix: /api/v1/posts) ────────────────────────────────────────
  posts: {
    feed:    `${V1}/posts/feed`,
    create:  `${V1}/posts`,
    byId:    (id: string) => `${V1}/posts/${id}`,
    byUser:  (userId: string) => `${V1}/posts/user/${userId}`,
    react:   (id: string) => `${V1}/posts/${id}/react`,
    update:  (id: string) => `${V1}/posts/${id}`,
  },

  // ── Subscriptions (prefix: /api/v1) ───────────────────────────────────────
  subscriptions: {
    plans:      `${V1}/plans`,
    me:         `${V1}/subscriptions/me`,
    subscribe:  `${V1}/subscriptions`,
    cancel:     `${V1}/subscriptions/me`,
  },

  // ── Payments (prefix: /api/v1/payments) ───────────────────────────────────
  payments: {
    history: `${V1}/payments`,
    byId:    (id: string) => `${V1}/payments/${id}`,
  },

  // ── Tickets standalone (prefix: /api/v1/tickets) ──────────────────────────
  tickets: {
    me:       `${V1}/tickets/me`,
    byId:     (id: string) => `${V1}/tickets/${id}`,
    validate: (id: string) => `${V1}/tickets/${id}/validate`,
  },

  // ── Search (prefix: /api/v1/search) ───────────────────────────────────────
  search: {
    query:          `${V1}/search`,
    trending:       `${V1}/search/trending`,
    newContent:     `${V1}/search/new`,
    trendingReels:  `${V1}/search/trending/reels`,
    upcomingEvents: `${V1}/search/upcoming/events`,
    feed:           `${V1}/search/feed`,
  },

  // ── Communities ───────────────────────────────────────────────────────────
  communities: {
    list:       `${V1}/communities`,
    create:     `${V1}/communities`,
    mine:       `${V1}/communities/me`,
    discover:   `${V1}/communities/discover/list`,
    byId:       (id: string) => `${V1}/communities/${id}`,
    join:       (id: string) => `${V1}/communities/${id}/join`,
    leave:      (id: string) => `${V1}/communities/${id}/leave`,
    members:    (id: string) => `${V1}/communities/${id}/members`,
    block:      (cid: string, uid: string) => `${V1}/communities/${cid}/block/${uid}`,
    blocked:    (id: string) => `${V1}/communities/${id}/blocked`,
    role:       (id: string) => `${V1}/communities/${id}/role`,
    messages:   (id: string) => `${V1}/communities/${id}/messages`,
    message:    (cid: string, mid: string) => `${V1}/communities/${cid}/messages/${mid}`,
  },

  // ── Upload médias (Cloudinary) ────────────────────────────────────────────
  upload: {
    images: (folder: 'concerts' | 'events' | 'avatars' | 'reels' | 'stories' | 'messages' | 'posts' | 'communities') =>
      `${V1}/upload/images?folder=${folder}`,
    video: (folder: 'reels' | 'stories' | 'messages') =>
      `${V1}/upload/video?folder=${folder}`,
    audio: (folder: 'messages' | 'stories') =>
      `${V1}/upload/audio?folder=${folder}`,
    deleteImage: `${V1}/upload/images`,
  },

  // ── Stories (prefix: /api/v1/stories) ─────────────────────────────────────
  stories: {
    feed:    `${V1}/stories/feed`,
    me:      `${V1}/stories/me`,
    create:  `${V1}/stories`,
    view:    (id: string) => `${V1}/stories/${id}/view`,
    like:    (id: string) => `${V1}/stories/${id}/like`,
    viewers: (id: string) => `${V1}/stories/${id}/viewers`,
    edit:    (id: string) => `${V1}/stories/${id}`,
    delete:  (id: string) => `${V1}/stories/${id}`,
  },

  // ── Messages DM (prefix: /api/v1/messages) ───────────────────────────────
  messages: {
    conversations:    `${V1}/messages/conversations`,
    conversation:     (userId: string) => `${V1}/messages/conversations/${userId}`,
    markRead:         (userId: string) => `${V1}/messages/conversations/${userId}/read`,
    usersSearch:      `${V1}/messages/users/search`,
    message:          (messageId: string) => `${V1}/messages/messages/${messageId}`,
  },

  // ── Orange Money ──────────────────────────────────────────────────────────
  orangeMoney: {
    sendOtp: `${V1}/orange-money/send-otp`,
    pay:     `${V1}/orange-money/pay`,
  },

  // ── Wallet / Monétisation (prefix: /api/v1/wallet) ───────────────────────
  wallet: {
    balance:          `${V1}/wallet/me`,
    transfer:         `${V1}/wallet/transfer`,
    transactions:     `${V1}/wallet/transactions`,
    purchase:         `${V1}/wallet/purchase`,
    packages:         `${V1}/wallet/packages`,
    sendGift:         `${V1}/wallet/gifts/send`,
    giftTypes:        `${V1}/wallet/gifts`,
    withdraw:         `${V1}/wallet/withdraw`,
    withdrawHistory:  `${V1}/wallet/withdraw/history`,
    creatorProfile:   `${V1}/wallet/creator/profile`,
    creatorStats:     `${V1}/wallet/creator/stats`,
    purchaseCustom:   `${V1}/wallet/purchase/custom`,
    // Boost
    boostsActive:     `${V1}/wallet/boosts/active`,
    boostsHistory:    `${V1}/wallet/boosts/history`,
    boostsPurchase:   `${V1}/wallet/boosts/purchase`,
    boostCancel:      (id: string) => `${V1}/wallet/boosts/${id}`,
  },

  // ── Lives simples (spontanés) ─────────────────────────────────────────────
  lives: {
    list:   `${V1}/lives`,
    me:     `${V1}/lives/me`,
    start:  `${V1}/lives/start`,
    byId:   (id: string) => `${V1}/lives/${id}`,
    stop:   (id: string) => `${V1}/lives/${id}/stop`,
    token:  (id: string) => `${V1}/lives/${id}/token`,
    status: (id: string) => `${V1}/lives/${id}/status`,
  },

  // ── Système ───────────────────────────────────────────────────────────────
  system: {
    health: '/health',
    root:   '/',
  },

  // ── Planning (agenda perso) ───────────────────────────────────────────────
  planning: {
    feed:          `${V1}/planning`,
    entries:       `${V1}/planning/entries`,
    entry:         (id: string) => `${V1}/planning/entries/${id}`,
    invites:       `${V1}/planning/invites`,
    respondInvite: (id: string) => `${V1}/planning/invites/${id}`,
  },

  // ── Activité sociale ──────────────────────────────────────────────────────
  activity: {
    feed: `${V1}/activity/feed`,
  },

  // ── Signalements ──────────────────────────────────────────────────────────
  reports: {
    create: `${V1}/reports`,
  },

  // ── Notifications persistantes ─────────────────────────────────────────────
  notifications: {
    list:          `${V1}/notifications`,
    unreadCount:   `${V1}/notifications/unread-count`,
    readAll:       `${V1}/notifications/read-all`,
    read:          (id: string) => `${V1}/notifications/${id}/read`,
    delete:        (id: string) => `${V1}/notifications/${id}`,
    deleteAll:     `${V1}/notifications`,
    deviceToken:   `${V1}/notifications/device-token`,
  },
} as const;
