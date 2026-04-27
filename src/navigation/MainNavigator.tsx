import React, { useEffect } from 'react';
import { Platform, PermissionsAndroid }   from 'react-native';
import { createBottomTabNavigator }   from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useNavigation }              from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { FeedScreen as HomeScreen } from '../screens/Main/FeedScreen';
import { PlanningScreen }          from '../screens/Main/PlanningScreen';
import { ReelsScreen }            from '../screens/Main/ReelsScreen';
import { ActivityScreen }         from '../screens/Main/ActivityScreen';
import { MessagesScreen }         from '../screens/Main/MessagesScreen';
import { FeedScreen }             from '../screens/Main/FeedScreen';
import { ProfileScreen }          from '../screens/Main/ProfileScreen';
import { CreateEventScreen }      from '../screens/Create/CreateEventScreen';
import { CreateConcertScreen }    from '../screens/Create/CreateConcertScreen';
import { CreateReelScreen }       from '../screens/Create/CreateReelScreen';
import { ConcertDetailScreen }    from '../screens/Detail/ConcertDetailScreen';
import { EventDetailScreen }      from '../screens/Detail/EventDetailScreen';
import { UserProfileScreen }       from '../screens/Profile/UserProfileScreen';
import { EditProfileScreen }        from '../screens/Profile/EditProfileScreen';
import { FilmsScreen }            from '../screens/Main/FilmsScreen';
import { TrendingScreen }         from '../screens/Main/TrendingScreen';
import { FavoritesScreen }        from '../screens/Main/FavoritesScreen';
import { NotificationsScreen }    from '../screens/Main/NotificationsScreen';
import { SubscriptionsScreen }    from '../screens/Main/SubscriptionsScreen';
import { SettingsScreen }         from '../screens/Main/SettingsScreen';
import { ChangePasswordScreen }   from '../screens/Main/ChangePasswordScreen';
import { PrivacyScreen }           from '../screens/Main/PrivacyScreen';
import { ChatScreen }             from '../screens/Main/ChatScreen';
import { NewConversationScreen }  from '../screens/Main/NewConversationScreen';
import { NewCallScreen }          from '../screens/Main/NewCallScreen';
import { FollowingScreen }        from '../screens/Main/FollowingScreen';
import { CommunitiesScreen }      from '../screens/Main/CommunitiesScreen';
import { CommunityDetailScreen }  from '../screens/Detail/CommunityDetailScreen';
import { CommunityChatScreen }     from '../screens/Main/CommunityChatScreen';
import { CallScreen }              from '../screens/Main/CallScreen';
import { EventsScreen }            from '../screens/Main/EventsScreen';
import { ConcertsScreen }          from '../screens/Main/ConcertsScreen';
import { BlockedUsersScreen }      from '../screens/Main/BlockedUsersScreen';
import { LiveStreamScreen }        from '../screens/Live/LiveStreamScreen';
import { LiveViewerScreen }        from '../screens/Live/LiveViewerScreen';
import { LiveListScreen }          from '../screens/Live/LiveListScreen';
import { MyStoriesScreen }         from '../screens/Profile/MyStoriesScreen';
import { FilmDetailScreen }        from '../screens/Detail/FilmDetailScreen';
import { AppTabBar, NotificationToast } from '../components/common';

// ── Types ─────────────────────────────────────────────────────────────────────


export type MainTabParamList = {
  Home:     undefined;
  Planning: undefined;
  Reels:    { initialReelId?: string } | undefined;
  Profile:  undefined;
};


export type MainStackParamList = {
  Tabs:          undefined;
  Feed:          undefined;
  CreateEvent:   { eventId?: string }  | undefined;
  CreateConcert: { concertId?: string } | undefined;
  CreateReel:    { reelPublished?: boolean } | undefined;
  ConcertDetail: { concertId: string };
  EventDetail:   { eventId:   string };
  UserProfile:  { userId:    string };
  EditProfile:  undefined;
  Messages:      undefined;
  Films:         undefined;
  FilmDetail:    { item: any };
  Trending:      undefined;
  Favorites:     undefined;
  Notifications: undefined;
  Subscriptions: undefined;
  Settings:      undefined;
  ChangePassword: undefined;
  Privacy:        undefined;
  Chat:            { partnerId: string; partnerName: string; avatarUrl?: string };
  Call:            { partnerId: string; partnerName: string; callType: 'voice' | 'video'; isIncoming: boolean; offer?: any };
  NewConversation:  undefined;
  NewCall:          undefined;
  Following:        { userId?: string; tab?: 'followers' | 'following' } | undefined;
  CommunityChat:    { communityId: string; communityName: string };
  Communities:       undefined;
  CommunityDetail:   { communityId: string };
  Events:            undefined;
  Concerts:          undefined;
  BlockedUsers:      undefined;
  LiveList:          undefined;
  LiveStream:        { concertId: string };
  LiveViewer:        { concertId: string };
  Activity:          undefined;
  MyStories:         undefined;
};

type MainNav = NativeStackNavigationProp<MainStackParamList>;

const Tab   = createBottomTabNavigator<MainTabParamList>();
const Stack = createNativeStackNavigator<MainStackParamList>();

// ── EventsScreen wrapper ──────────────────────────────────────────────────────

// ── ProfileScreen wrapper ─────────────────────────────────────────────────────

interface ProfileTabProps { onLogout: () => void; }

const ProfileTab: React.FC<ProfileTabProps> = ({ onLogout }) => {
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

interface TabsProps { onLogout: () => void; }

const Tabs: React.FC<TabsProps> = ({ onLogout }) => (
  <Tab.Navigator
    tabBar={props => <AppTabBar {...props} />}
    screenOptions={{ headerShown: false }}
  >
    <Tab.Screen name="Home"     component={HomeScreen} />
    <Tab.Screen name="Planning" component={PlanningScreen} />
    <Tab.Screen
      name="Reels"
      component={ReelsScreen}
      options={{ tabBarStyle: { display: 'none' } }}
    />
    <Tab.Screen name="Profile">
      {() => <ProfileTab onLogout={onLogout} />}
    </Tab.Screen>
  </Tab.Navigator>
);

// ── MainNavigator ─────────────────────────────────────────────────────────────

interface Props { onLogout: () => void; }

export const MainNavigator: React.FC<Props> = ({ onLogout }) => {
  useEffect(() => {
    if (Platform.OS === 'android') {
      PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        PermissionsAndroid.PERMISSIONS.CAMERA,
      ]).catch(() => {});
    }
  }, []);

  return (
  <>
  <NotificationToast />
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="Tabs">
      {() => <Tabs onLogout={onLogout} />}
    </Stack.Screen>

    <Stack.Screen
      name="Feed"
      component={FeedScreen}
      options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
    />

    <Stack.Screen
      name="CreateEvent"
      options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
    >
      {({ navigation, route }) => (
        <CreateEventScreen
          eventId={(route.params as any)?.eventId}
          onBack={() => navigation.goBack()}
        />
      )}
    </Stack.Screen>

    <Stack.Screen
      name="CreateConcert"
      options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
    >
      {({ navigation, route }) => (
        <CreateConcertScreen
          concertId={(route.params as any)?.concertId}
          onBack={() => navigation.goBack()}
        />
      )}
    </Stack.Screen>

    <Stack.Screen
      name="ConcertDetail"
      options={{ animation: 'slide_from_right' }}
    >
      {({ navigation, route }) => (
        <ConcertDetailScreen
          concertId={(route.params as { concertId: string }).concertId}
          onBack={() => navigation.goBack()}
        />
      )}
    </Stack.Screen>

    <Stack.Screen
      name="EventDetail"
      options={{ animation: 'slide_from_right' }}
    >
      {({ navigation, route }) => (
        <EventDetailScreen
          eventId={(route.params as { eventId: string }).eventId}
          onBack={() => navigation.goBack()}
        />
      )}
    </Stack.Screen>
    <Stack.Screen
      name="UserProfile"
      options={{ animation: 'slide_from_right' }}
    >
      {({ route, navigation }) => (
        <UserProfileScreen
          route={route as any}
          navigation={navigation}
        />
      )}
    </Stack.Screen>
    <Stack.Screen
      name="EditProfile"
      options={{ animation: 'slide_from_right' }}
    >
      {({ navigation }) => (
        <EditProfileScreen navigation={navigation} />
      )}
    </Stack.Screen>
    <Stack.Screen
      name="CreateReel"
      options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
    >
      {({ navigation }) => (
        <CreateReelScreen onBack={() => navigation.goBack()} />
      )}
    </Stack.Screen>

    <Stack.Screen
      name="Messages"
      component={MessagesScreen}
      options={{ animation: 'slide_from_right' }}
    />
    <Stack.Screen
      name="Films"
      component={FilmsScreen}
      options={{ animation: 'slide_from_right' }}
    />
    <Stack.Screen
      name="FilmDetail"
      options={{ animation: 'slide_from_right' }}
    >
      {({ navigation, route }) => (
        <FilmDetailScreen
          route={route as any}
          navigation={navigation}
        />
      )}
    </Stack.Screen>
    <Stack.Screen
      name="Trending"
      component={TrendingScreen}
      options={{ animation: 'slide_from_right' }}
    />
    <Stack.Screen
      name="Favorites"
      component={FavoritesScreen}
      options={{ animation: 'slide_from_right' }}
    />
    <Stack.Screen
      name="Activity"
      component={ActivityScreen}
      options={{ animation: 'slide_from_right' }}
    />
    <Stack.Screen
      name="Notifications"
      component={NotificationsScreen}
      options={{ animation: 'slide_from_right' }}
    />
    <Stack.Screen
      name="Subscriptions"
      component={SubscriptionsScreen}
      options={{ animation: 'slide_from_right' }}
    />
    <Stack.Screen
      name="Settings"
      options={{ animation: 'slide_from_right' }}
    >
      {() => <SettingsScreen onLogout={onLogout} />}
    </Stack.Screen>
    <Stack.Screen
      name="ChangePassword"
      options={{ animation: 'slide_from_right' }}
    >
      {({ navigation: nav }) => (
        <ChangePasswordScreen navigation={nav} />
      )}
    </Stack.Screen>
    <Stack.Screen
      name="Privacy"
      options={{ animation: 'slide_from_right' }}
    >
      {({ navigation: nav }) => (
        <PrivacyScreen navigation={nav} />
      )}
    </Stack.Screen>
    <Stack.Screen
      name="Chat"
      component={ChatScreen}
      options={{ animation: 'slide_from_right' }}
    />
    <Stack.Screen
      name="Call"
      component={CallScreen}
      options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }}
    />
    <Stack.Screen
      name="NewConversation"
      component={NewConversationScreen}
      options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
    />
    <Stack.Screen
      name="NewCall"
      component={NewCallScreen}
      options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
    />
    <Stack.Screen
      name="CommunityChat"
      component={CommunityChatScreen}
      options={{ headerShown: false, animation: 'slide_from_right' }}
    />
    <Stack.Screen
      name="Following"
      component={FollowingScreen}
      options={{ headerShown: false, animation: 'slide_from_right' }}
    />
    <Stack.Screen
      name="Communities"
      component={CommunitiesScreen}
      options={{ headerShown: false, animation: 'slide_from_right' }}
    />
    <Stack.Screen
      name="CommunityDetail"
      component={CommunityDetailScreen as any}
      options={{ headerShown: false, animation: 'slide_from_right' }}
    />
    <Stack.Screen
      name="Events"
      component={EventsScreen}
      options={{ animation: 'slide_from_right' }}
    />
    <Stack.Screen
      name="Concerts"
      component={ConcertsScreen}
      options={{ animation: 'slide_from_right' }}
    />
    <Stack.Screen
      name="BlockedUsers"
      component={BlockedUsersScreen}
      options={{ animation: 'slide_from_right' }}
    />
    <Stack.Screen
      name="LiveList"
      component={LiveListScreen}
      options={{ animation: 'slide_from_right' }}
    />
    <Stack.Screen
      name="MyStories"
      component={MyStoriesScreen}
      options={{ animation: 'slide_from_right', headerShown: false }}
    />
    <Stack.Screen
      name="LiveStream"
      options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }}
    >
      {({ navigation, route }) => (
        <LiveStreamScreen
          concertId={(route.params as { concertId: string }).concertId}
          onBack={() => navigation.goBack()}
        />
      )}
    </Stack.Screen>
    <Stack.Screen
      name="LiveViewer"
      options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }}
    >
      {({ navigation, route }) => (
        <LiveViewerScreen
          concertId={(route.params as { concertId: string }).concertId}
          onBack={() => navigation.goBack()}
        />
      )}
    </Stack.Screen>
  </Stack.Navigator>
  </>
  );
};
