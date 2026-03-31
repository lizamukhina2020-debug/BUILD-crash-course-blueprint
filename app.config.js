export default {
  expo: {
    name: "SeedMind",
    slug: "SeedMind",
    version: "1.0.0",
    updates: {
      url: "https://u.expo.dev/d31dd93f-ef85-4dbf-a5d1-a10dffe71e94"
    },
    runtimeVersion: {
      policy: "appVersion"
    },
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "light",
    newArchEnabled: true,
    splash: {
      image: "./assets/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#FAF7F2"
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.seedmind.app",
      buildNumber: "18",
      // Required for @react-native-firebase/* (Analytics, etc).
      // Download from Firebase Console → Project settings → Your apps (iOS).
      googleServicesFile: "./firebase/GoogleService-Info.plist",
      infoPlist: {
        CFBundleDevelopmentRegion: "en",
        ITSAppUsesNonExemptEncryption: false,
        UIBackgroundModes: ["audio"],
        // Required for Google auth redirect back into the app (reversed client id scheme).
        CFBundleURLTypes: [
          {
            CFBundleURLSchemes: [
              "com.googleusercontent.apps.459383561842-bet5t0fstc62k263f6o0sfcmtms6o0oe"
            ]
          }
        ]
      }
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#FAF7F2"
      },
      package: "com.seedmind.app",
      // Required for @react-native-firebase/* (Analytics, etc).
      // Download from Firebase Console → Project settings → Your apps (Android).
      googleServicesFile: "./firebase/google-services.json"
    },
    web: {
      favicon: "./assets/favicon.png",
      bundler: "metro"
    },
    extra: {
      eas: {
        projectId: "d31dd93f-ef85-4dbf-a5d1-a10dffe71e94"
      },
      // Dev/test builds (Dev Client + internal/TestFlight) can enable extra tester-only UI.
      // Do NOT enable this for App Store production builds.
      internalBuild: (process.env.INTERNAL_BUILD || "").toLowerCase() === "true",
      // SECURITY: Do NOT ship DeepSeek API keys in the client. Use Cloud Run proxy instead.
      // (For internal builds you may set DEEPSEEK_API_KEY, but never hardcode it here.)
      deepseekApiKey: process.env.DEEPSEEK_API_KEY || "",
      // Cloud Run proxy URL (DeepSeek-compatible endpoint).
      // NOTE: The URL itself is not a secret; keeping a safe default prevents TestFlight builds
      // from shipping with an empty proxy URL when env/secret wiring is misconfigured.
      // You can still override it via EAS secret/env `DEEPSEEK_PROXY_URL`.
      deepseekProxyUrl:
        process.env.DEEPSEEK_PROXY_URL ||
        "https://seedmind-api-459383561842.europe-west1.run.app/v1/chat/completions",
      revenueCat: {
        appleApiKey: process.env.REVENUECAT_APPLE_API_KEY || "appl_DTLKesFWjkXZawJvpYysQsWmDBg",
        // Entitlement identifier in RevenueCat (Dashboard → Product catalog → Entitlements).
        // From your setup screenshot: "SeedMind Premium"
        entitlementId: process.env.REVENUECAT_ENTITLEMENT_ID || "SeedMind Premium",
        // Optional, for later Android launch:
        googleApiKey: process.env.REVENUECAT_GOOGLE_API_KEY || "",
      },
      // Website used for App Store links (Privacy/Terms/Support). Set after Vercel deploy.
      // Example: "https://seedmind-yourproject.vercel.app"
      websiteBaseUrl: "https://seedmind.vercel.app",
      // Optional. Leave blank until you create a real email.
      supportEmail: "seedmindsupport@gmail.com",
      // iOS App Store product page (Apple ID from App Store Connect). Override via APP_STORE_URL if needed.
      appStoreUrl:
        process.env.APP_STORE_URL || "https://apps.apple.com/app/id6759827726",
      // Firebase config is not a secret (safe to keep in app config), but keep it here
      // so the app can be configured per-environment.
      firebase: {
        apiKey: process.env.FIREBASE_API_KEY || "AIzaSyBZPwzx8Wx-bUgpqhhUqzbIq4u6uLF9fiM",
        authDomain: process.env.FIREBASE_AUTH_DOMAIN || "seedmind-7d2ae.firebaseapp.com",
        projectId: process.env.FIREBASE_PROJECT_ID || "seedmind-7d2ae",
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "seedmind-7d2ae.firebasestorage.app",
        messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "459383561842",
        appId: process.env.FIREBASE_APP_ID || "1:459383561842:web:8478ff5e73bd7b1f5b2ceb",
      },
      googleAuth: {
        // From Google Cloud Console OAuth client IDs (used by expo-auth-session)
        iosClientId:
          process.env.GOOGLE_IOS_CLIENT_ID ||
          "459383561842-bet5t0fstc62k263f6o0sfcmtms6o0oe.apps.googleusercontent.com",
        androidClientId: process.env.GOOGLE_ANDROID_CLIENT_ID || "",
        webClientId:
          process.env.GOOGLE_WEB_CLIENT_ID ||
          "459383561842-vucct9m2ocema8fp9rk8as8ho8objvsp.apps.googleusercontent.com",
      },
    },
    plugins: [
      "expo-font",
      [
        "expo-localization",
        {
          supportedLocales: {
            ios: ["en", "ru"],
            android: ["en", "ru"],
          },
        },
      ],
      "expo-web-browser",
      "@react-native-community/datetimepicker",
      "@react-native-firebase/app",
      "./plugins/withPodfileModularHeaders",
      [
        "expo-notifications",
        {
          "icon": "./assets/icon.png",
          "color": "#5C3D2E"
        }
      ]
    ]
  }
};

