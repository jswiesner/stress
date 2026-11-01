# Releasing Stress on the App Store

The game is a static web app. The iOS app wraps it with [Capacitor](https://capacitorjs.com) 8, which adds a native shell (haptics, launch splash, status bar) and bundles the game files so it runs fully offline. The Xcode project is in `ios/` and is committed. It uses Swift Package Manager, so there is no CocoaPods step.

## What you need

- A Mac with the current Xcode from the Mac App Store. App Store Connect only accepts builds made with a recent iOS SDK.
- Node.js 22 or newer.
- An [Apple Developer Program](https://developer.apple.com/programs/) membership (US$99 a year) to sign, use TestFlight and publish.

## One-time setup

```sh
npm install           # Capacitor CLI, the iOS platform and the three plugins
npm run ios           # copies the game into dist/ and syncs it into ios/
npm run ios:open      # opens ios/App/App.xcodeproj in Xcode
```

In Xcode, select the **App** target, then:

1. **Signing & Capabilities:** choose your Team and leave *Automatically manage signing* on.
2. **General › Identity:** the bundle identifier is `com.jswiesner.stress`. If you register a different one, change it here **and** in `capacitor.config.json` (`appId`).
3. **General › Identity:** the version is `3.0.0` and the build is `1`. Raise the build number for every upload.

Everything else is already configured:

| Setting | Where | Value |
|---|---|---|
| Display name | `Info.plist` | Stress |
| iPhone orientation | `Info.plist` | Portrait only |
| iPad orientation | `Info.plist` | All four (the game has portrait and landscape tablet layouts) |
| Export compliance | `Info.plist` | `ITSAppUsesNonExemptEncryption = NO` |
| Category hint | `Info.plist` | `public.app-category.board-games` |
| App icon | `Assets.xcassets/AppIcon` | Light, dark and tinted 1024 px variants |
| Launch screen | `Assets.xcassets/Splash` | Branded splash, light and dark |
| Minimum iOS | Xcode project | 15.0 |

## Day-to-day loop

1. Change the game (`index.html`, `style.css`, `src/`) and test it in a browser (`npm run serve`).
2. Run `npm test` and `npm run e2e`.
3. Run `npm run ios` to rebuild `dist/` and copy it into the Xcode project.
4. Press Run in Xcode, on a simulator or a device.

`tools/build.js` refuses to build if a file the page or the offline cache needs is missing.

## Native behavior

All native calls go through `src/native.js` and `src/haptics.js`, and every one of them is a no-op in a browser.

- **Splash:** stays up until the first screen has painted (`launchAutoHide: false`), then fades. A 3-second safety timer takes it down regardless.
- **Status bar:** follows the in-app Appearance setting (Auto, Light, Dark).
- **Haptics:** a selection tick when you pick up a piece, a tap for each move and raid, an impact on captures, a heavy thump for cracks and Crown captures, a warning when your Crown is attacked, and a success or warning notification at the end of a game. Turn them off in *Settings › Haptics*.
- **Offline:** everything ships inside the app, so there is no network access at all. The web build's service worker is not used in the app.
- **Storage:** progress lives in the WebView's local storage, in the app's own container.

## Ship a build

1. In Xcode, set the run destination to **Any iOS Device (arm64)**, then choose **Product › Archive**.
2. In the Organizer, choose **Distribute App › App Store Connect › Upload**.
3. In [App Store Connect](https://appstoreconnect.apple.com), wait for processing (usually 10–30 minutes), then add the build to **TestFlight**.
4. Test on real phones for at least a week: the tutorial, a full rival ladder session, the daily puzzle across midnight, and dark mode.
5. Fill in the App Store page from [`store/listing.md`](../store/listing.md) and upload the screenshots from `store/screenshots/`.
6. **App Privacy:** Data Not Collected. **Age rating:** 4+.
7. Submit for review. The notes for the reviewer are in the listing file.

## Regenerating store assets

```sh
npm run icons    # app icons (web, App Store, iOS light/dark/tinted) and the launch splash
npm run shots    # App Store screenshots for iPhone 6.9" and iPad 13"
```

Both tools use Playwright's Chromium and render from the game's own art (`src/art.js`), so the icon and the characters always match the game.

## Before you submit

- [ ] Bundle ID registered and matching `capacitor.config.json`
- [ ] Version and build number raised
- [ ] Copyright filled in (`store/listing.md`)
- [ ] Support and privacy pages live: merge to the deploy branch so GitHub Pages serves `support.html` and `privacy.html`
- [ ] TestFlight pass on at least one small iPhone, one large iPhone and one iPad
- [ ] Screenshots uploaded for the 6.9" iPhone and 13" iPad slots
- [ ] After approval: put the App Store link in `STORE_URL` in `src/main.js`, so shared results point to the store

## Later

- **Ratings prompt:** call `SKStoreReviewController` after a first 3-star win or a 7-day streak, for example through the `@capacitor-community/in-app-review` plugin.
- **Game Center:** leaderboards and achievements (needs a native plugin and App Store Connect setup).
- **In-app purchase:** "Stress Plus" through StoreKit 2. See [`STRESS-3.0.md`](STRESS-3.0.md#monetization).
- **Android:** `npm i @capacitor/android && npx cap add android`. The web code already handles Android's vibration API.
