import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider
import FirebaseCore
import UserNotifications

@main
class AppDelegate: UIResponder, UIApplicationDelegate, UNUserNotificationCenterDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    // Firebase doit être initialisé avant toute utilisation de
    // @react-native-firebase/app (messaging, auth) — sinon crash au premier
    // appel JS côté natif ("FirebaseApp.configure() was not called").
    FirebaseApp.configure()

    // Reçoit les notifications même quand l'app est au premier plan (sinon
    // iOS ne montre rien tant que l'app est ouverte) — Notifee/RNFirebaseMessaging
    // interceptent cet événement via leur propre delegate chaîné, mais le
    // UIApplicationDelegate doit déclarer la conformité pour que
    // registerForRemoteNotifications() fonctionne.
    UNUserNotificationCenter.current().delegate = self
    application.registerForRemoteNotifications()

    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    window = UIWindow(frame: UIScreen.main.bounds)

    factory.startReactNative(
      withModuleName: "stream_mobile",
      in: window,
      launchOptions: launchOptions
    )

    return true
  }

  // Affiche la notification (banner + son) même si l'app est au premier plan —
  // comportement par défaut iOS sans ce handler : rien ne s'affiche du tout.
  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    willPresent notification: UNNotification,
    withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
  ) {
    completionHandler([.banner, .sound, .badge, .list])
  }
}

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
