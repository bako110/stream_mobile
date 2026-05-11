import React, { useEffect, useCallback } from 'react';
import { Platform, PermissionsAndroid } from 'react-native';
import { createBottomTabNavigator }   from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useNavigation }              from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

// ── Tabs ──────────────────────────────────────────────────────────────────────
import { FeedScreen as HomeScreen } from '../screens/Main/FeedScreen';
import { CommunitiesScreen as CommunitiesTabScreen } from '../screens/Main/CommunitiesScreen';
import { ReelsScreen }              from '../screens/Main/ReelsScreen';
import { ProfileScreen }            from '../screens/Main/ProfileScreen';
import { PlanningScreen }           from '../screens/Main/PlanningScreen';
import { AppTabBar, NotificationToast } from '../components/common';

// ── Écrans stack ──────────────────────────────────────────────────────────────
import { FeedScreen }            from '../screens/Main/FeedScreen';
import { ActivityScreen }        from '../screens/Main/ActivityScreen';
import { MessagesScreen }        from '../screens/Main/MessagesScreen';
import { FilmsScreen }           from '../screens/Main/FilmsScreen';
import { TrendingScreen }        from '../screens/Main/TrendingScreen';
import { FavoritesScreen }       from '../screens/Main/FavoritesScreen';
import { NotificationsScreen }   from '../screens/Main/NotificationsScreen';
import { SubscriptionsScreen }   from '../screens/Main/SubscriptionsScreen';
import { SettingsScreen }        from '../screens/Main/SettingsScreen';
import { ChangePasswordScreen }  from '../screens/Main/ChangePasswordScreen';
import { PrivacyScreen }         from '../screens/Main/PrivacyScreen';
import { ChatScreen }            from '../screens/Main/ChatScreen';
import { NewConversationScreen } from '../screens/Main/NewConversationScreen';
import { NewCallScreen }         from '../screens/Main/NewCallScreen';
import { FollowingScreen }       from '../screens/Main/FollowingScreen';
import { CommunitiesScreen }     from '../screens/Main/CommunitiesScreen';
import { CommunityChatScreen }   from '../screens/Main/CommunityChatScreen';
import { CallScreen }            from '../screens/Main/CallScreen';
import { EventsScreen }          from '../screens/Main/EventsScreen';
import { ConcertsScreen }        from '../screens/Main/ConcertsScreen';
import { BlockedUsersScreen }    from '../screens/Main/BlockedUsersScreen';
import { WatchHistoryScreen }    from '../screens/Main/WatchHistoryScreen';
import { UserReelsScreen }       from '../screens/Main/UserReelsScreen';
import { CreateEventScreen }     from '../screens/Create/CreateEventScreen';
import { CreateConcertScreen }   from '../screens/Create/CreateConcertScreen';
import { CreateReelScreen }      from '../screens/Create/CreateReelScreen';
import { CreatePostScreen }      from '../screens/Create/CreatePostScreen';
import { ConcertDetailScreen }   from '../screens/Detail/ConcertDetailScreen';
import { EventDetailScreen }     from '../screens/Detail/EventDetailScreen';
import { FilmDetailScreen }      from '../screens/Detail/FilmDetailScreen';
import { SerieEpisodesScreen }   from '../screens/Detail/SerieEpisodesScreen';
import { VideoPlayerScreen }     from '../screens/Detail/VideoPlayerScreen';
import { CommunityDetailScreen }   from '../screens/Detail/CommunityDetailScreen';
import { AdminVerificationScreen }        from '../screens/Detail/AdminVerificationScreen';
import CommunityMembersScreen             from '../screens/Detail/CommunityMembersScreen';
import { CommunityStatsScreen }           from '../screens/Detail/CommunityStatsScreen';
import { CommunityEventsScreen }          from '../screens/Detail/CommunityEventsScreen';
import { CommunityMemberProfileScreen }   from '../screens/Detail/CommunityMemberProfileScreen';
import { CommunityLeaderboardScreen }     from '../screens/Detail/CommunityLeaderboardScreen';
import { PostDetailScreen }               from '../screens/Detail/PostDetailScreen';
import { MyTicketScreen }        from '../screens/Detail/MyTicketScreen';
import { AttendeesScreen }       from '../screens/Detail/AttendeesScreen';
import { TicketScannerScreen }   from '../screens/Detail/TicketScannerScreen';
import { UserProfileScreen }     from '../screens/Profile/UserProfileScreen';
import { EditProfileScreen }     from '../screens/Profile/EditProfileScreen';
import { MyStoriesScreen }       from '../screens/Profile/MyStoriesScreen';
import { LiveStreamScreen }        from '../screens/Live/LiveStreamScreen';
import { LiveViewerScreen }        from '../screens/Live/LiveViewerScreen';
import { LiveListScreen }          from '../screens/Live/LiveListScreen';
import { SimpleLiveListScreen }    from '../screens/Live/SimpleLiveListScreen';
import { GoLiveScreen }            from '../screens/Live/GoLiveScreen';
import { SimpleLiveStreamScreen }  from '../screens/Live/SimpleLiveStreamScreen';
import { SimpleLiveViewerScreen }  from '../screens/Live/SimpleLiveViewerScreen';
import WalletScreen           from '../screens/Wallet/WalletScreen';
import BuyCoinsScreen         from '../screens/Wallet/BuyCoinsScreen';
import CreatorDashboardScreen from '../screens/Wallet/CreatorDashboardScreen';
import WithdrawScreen         from '../screens/Wallet/WithdrawScreen';
import TransferScreen         from '../screens/Wallet/TransferScreen';
import BoostScreen            from '../screens/Wallet/BoostScreen';
import { WebQRScannerScreen } from '../screens/Auth/WebQRScannerScreen';

// ── Types ─────────────────────────────────────────────────────────────────────

export type MainTabParamList = {
  Home:        undefined;
  Communities: undefined;
  Reels:       { initialReelId?: string } | undefined;
  Profile:     undefined;
};

export type MainStackParamList = {
  Tabs:            undefined;
  Planning:        undefined;
  Feed:            undefined;
  CreateEvent:     { eventId?: string }  | undefined;
  CreateConcert:   { concertId?: string } | undefined;
  CreateReel:      { reelPublished?: boolean } | undefined;
  ConcertDetail:   { concertId: string };
  EventDetail:     { eventId:   string };
  MyTicket:        { ticket: any };
  Attendees:       { eventId: string; eventTitle: string };
  TicketScanner:   { eventId: string; eventTitle: string };
  UserProfile:     { userId:    string };
  EditProfile:     undefined;
  Messages:        undefined;
  Films:           undefined;
  FilmDetail:      { item: any };
  SerieEpisodes:   { item: any };
  WatchHistory:    undefined;
  VideoPlayer:     { url: string; title: string; videoId?: string; contentId?: string; episodeId?: string; contentType?: 'film' | 'serie_episode'; thumbnailUrl?: string; totalSeconds?: number };
  Trending:        undefined;
  Favorites:       undefined;
  Notifications:   undefined;
  Subscriptions:   undefined;
  Settings:        undefined;
  ChangePassword:  undefined;
  Privacy:         undefined;
  Chat:            { partnerId: string; partnerName: string; avatarUrl?: string };
  Call:            { partnerId: string; partnerName: string; callType: 'voice' | 'video'; isIncoming: boolean; offer?: any };
  NewConversation: undefined;
  NewCall:         undefined;
  Following:       { userId?: string; tab?: 'followers' | 'following' } | undefined;
  CommunityChat:           { communityId: string; communityName: string };
  Communities:             undefined;
  CommunityDetail:         { communityId: string };
  CommunityMembers:        { communityId: string; communityName: string };
  CommunityStats:          { communityId: string; communityName: string };
  CommunityEvents:         { communityId: string; communityName: string };
  CommunityMemberProfile:  { communityId: string; communityName: string; memberId: string; memberName: string };
  CommunityLeaderboard:    { communityId: string; communityName: string };
  Events:                  undefined;
  Concerts:        undefined;
  BlockedUsers:    undefined;
  LiveList:          undefined;
  LiveStream:        { concertId: string };
  LiveViewer:        { concertId: string };
  SimpleLiveList:    undefined;
  GoLive:            undefined;
  SimpleLiveStream:  { liveId: string; publisherToken: string; livekitUrl: string; userId: string };
  SimpleLiveViewer:  { liveId: string };
  Activity:        undefined;
  MyStories:       undefined;
  UserReels:       { userId: string; initialReelId?: string; initialReels?: any[] };
  PostDetail:      { postId: string };
  CreatePost:      undefined;
  Wallet:          undefined;
  BuyCoins:        undefined;
  CreatorDashboard: undefined;
  Withdraw:        undefined;
  Transfer:        { recipientId?: string; recipientName?: string; recipientAvatar?: string } | undefined;
  Boost:                undefined;
  AdminVerification:    undefined;
  WebQRScanner:         undefined;
};

type MainNav = NativeStackNavigationProp<MainStackParamList>;

const Tab   = createBottomTabNavigator<MainTabParamList>();
const Stack = createNativeStackNavigator<MainStackParamList>();

// ── Wrappers pour les écrans qui attendent des props custom ───────────────────

const ConcertDetailWrapper: React.FC<any>  = ({ navigation, route }) => <ConcertDetailScreen concertId={route.params.concertId} onBack={() => navigation.goBack()} />;
const EventDetailWrapper: React.FC<any>    = ({ navigation, route }) => <EventDetailScreen eventId={route.params.eventId} onBack={() => navigation.goBack()} />;
const CreateReelWrapper: React.FC<any>     = ({ navigation }) => <CreateReelScreen onBack={() => navigation.goBack()} />;
const LiveStreamWrapper: React.FC<any>     = ({ navigation, route }) => <LiveStreamScreen concertId={route.params.concertId} onBack={() => navigation.goBack()} />;
const LiveViewerWrapper: React.FC<any>     = ({ navigation, route }) => <LiveViewerScreen concertId={route.params.concertId} onBack={() => navigation.goBack()} />;
const CreateEventWrapper: React.FC<any>    = ({ navigation, route }) => <CreateEventScreen eventId={route.params?.eventId} onBack={() => navigation.goBack()} />;
const CreateConcertWrapper: React.FC<any>  = ({ navigation, route }) => <CreateConcertScreen concertId={route.params?.concertId} onBack={() => navigation.goBack()} />;
const CreatePostWrapper: React.FC<any>     = ({ navigation }) => <CreatePostScreen onBack={() => navigation.goBack()} onPostCreated={() => navigation.goBack()} />;
const PostDetailWrapper: React.FC<any>     = ({ navigation, route }) => <PostDetailScreen postId={route.params.postId} onBack={() => navigation.goBack()} onAuthorPress={(userId: string) => navigation.navigate('UserProfile', { userId })} navigation={navigation} />;
const MyTicketWrapper: React.FC<any>       = ({ navigation, route }) => <MyTicketScreen ticket={route.params.ticket} onBack={() => navigation.goBack()} />;
const AttendeesWrapper: React.FC<any>      = ({ navigation, route }) => (
  <AttendeesScreen
    eventId={route.params.eventId}
    eventTitle={route.params.eventTitle}
    onBack={() => navigation.goBack()}
    onScan={() => navigation.navigate('TicketScanner', { eventId: route.params.eventId, eventTitle: route.params.eventTitle })}
  />
);
const TicketScannerWrapper: React.FC<any>  = ({ navigation, route }) => <TicketScannerScreen eventId={route.params.eventId} eventTitle={route.params.eventTitle} onBack={() => navigation.goBack()} />;

// ── ProfileScreen wrapper ─────────────────────────────────────────────────────

const ProfileTab: React.FC<{ onLogout: () => void }> = ({ onLogout }) => {
  const nav = useNavigation<MainNav>();
  return (
    <ProfileScreen
      onLogout={onLogout}
      onCreateEvent={()   => nav.navigate('CreateEvent')}
      onCreateConcert={()  => nav.navigate('CreateConcert')}
      onEditProfile={()    => nav.navigate('EditProfile')}
    />
  );
};

// ── Tabs ──────────────────────────────────────────────────────────────────────

const Tabs: React.FC<{ onLogout: () => void }> = ({ onLogout }) => (
  <Tab.Navigator
    tabBar={props => <AppTabBar {...props} />}
    screenOptions={{ headerShown: false }}
  >
    <Tab.Screen name="Home"        component={HomeScreen} />
    <Tab.Screen name="Communities" component={CommunitiesTabScreen} />
    <Tab.Screen name="Reels"       component={ReelsScreen} options={{ tabBarStyle: { display: 'none' } }} />
    <Tab.Screen name="Profile">
      {() => <ProfileTab onLogout={onLogout} />}
    </Tab.Screen>
  </Tab.Navigator>
);

// ── MainNavigator ─────────────────────────────────────────────────────────────

export const MainNavigator: React.FC<{ onLogout: () => void }> = ({ onLogout }) => {
  useEffect(() => {
    if (Platform.OS === 'android') {
      PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        PermissionsAndroid.PERMISSIONS.CAMERA,
      ]).catch(() => {});
    }
  }, []);

  const SettingsWrapper = useCallback(
    () => <SettingsScreen onLogout={onLogout} />,
    [onLogout],
  );

  return (
    <>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Tabs"           children={() => <Tabs onLogout={onLogout} />} />
        <Stack.Screen name="Feed"           component={FeedScreen}            options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="CreateEvent"    component={CreateEventWrapper}    options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="CreateConcert"  component={CreateConcertWrapper}  options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="ConcertDetail"  component={ConcertDetailWrapper}  options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="EventDetail"    component={EventDetailWrapper}    options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="UserProfile"    component={UserProfileScreen}     options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="EditProfile"    component={EditProfileScreen}     options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="CreateReel"     component={CreateReelWrapper}     options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="Messages"       component={MessagesScreen}        options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="Films"          component={FilmsScreen}           options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="FilmDetail"     component={FilmDetailScreen}      options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="SerieEpisodes"  component={SerieEpisodesScreen}   options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="WatchHistory"   component={WatchHistoryScreen}    options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="VideoPlayer"    component={VideoPlayerScreen}     options={{ animation: 'fade', statusBarHidden: true }} />
        <Stack.Screen name="Trending"       component={TrendingScreen}        options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="Favorites"      component={FavoritesScreen}       options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="Activity"       component={ActivityScreen}        options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="Notifications"  component={NotificationsScreen}   options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="Subscriptions"  component={SubscriptionsScreen}   options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="Settings"       component={SettingsWrapper}       options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="ChangePassword" component={ChangePasswordScreen}  options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="Privacy"        component={PrivacyScreen}         options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="Chat"           component={ChatScreen}            options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="Call"           component={CallScreen}            options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="NewConversation" component={NewConversationScreen} options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="NewCall"        component={NewCallScreen}         options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="CommunityChat"  component={CommunityChatScreen}   options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="Following"      component={FollowingScreen}       options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="Communities"    component={CommunitiesScreen}     options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="Planning"       component={PlanningScreen}        options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="CommunityDetail" component={CommunityDetailScreen} options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="Events"         component={EventsScreen}          options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="Concerts"       component={ConcertsScreen}        options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="BlockedUsers"   component={BlockedUsersScreen}    options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="LiveList"          component={LiveListScreen}          options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="SimpleLiveList"    component={SimpleLiveListScreen}    options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="GoLive"            component={GoLiveScreen}            options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="SimpleLiveStream"  component={SimpleLiveStreamScreen}  options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="SimpleLiveViewer"  component={SimpleLiveViewerScreen}  options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="MyStories"      component={MyStoriesScreen}       options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="LiveStream"     component={LiveStreamWrapper}     options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="LiveViewer"     component={LiveViewerWrapper}     options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="UserReels"      component={UserReelsScreen}       options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="CreatePost"     component={CreatePostWrapper}     options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="PostDetail"     component={PostDetailWrapper}     options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="MyTicket"       component={MyTicketWrapper}       options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="Attendees"      component={AttendeesWrapper}      options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="TicketScanner"  component={TicketScannerWrapper}  options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="Wallet"         component={WalletScreen}          options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="BuyCoins"       component={BuyCoinsScreen}        options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="CreatorDashboard" component={CreatorDashboardScreen} options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="Withdraw"       component={WithdrawScreen}        options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="Transfer"       component={TransferScreen}        options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="Boost"             component={BoostScreen}             options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="AdminVerification"       component={AdminVerificationScreen}       options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="CommunityMembers"        component={CommunityMembersScreen}        options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="CommunityStats"          component={CommunityStatsScreen}          options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="CommunityEvents"         component={CommunityEventsScreen}         options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="CommunityMemberProfile"  component={CommunityMemberProfileScreen}  options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="CommunityLeaderboard"    component={CommunityLeaderboardScreen}    options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="WebQRScanner"      component={WebQRScannerScreen}       options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
      </Stack.Navigator>
      <NotificationToast />
    </>
  );
};
