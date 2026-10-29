# @feedr/mobile

Plain iPhone prototype using Expo SDK 58, Expo Router and React Query. The same screens run on web.

From the repository root:

```sh
npm install
npm run dev:api
npm run dev:mobile
# or, for the browser:
npm run dev:mobile:web -- --port 8082
```

Open in an Expo Go release supporting SDK 58. Connect with the API's LAN URL (for example `http://192.168.1.10:4100`) and a `feedr_…` personal token. `localhost` only works when the browser and API run on the same computer. Create an account/token with `npm run account:create -- "Your name"`, then `npm run seed -- <userId>` for sample data.

Personal connections use SecureStore on iOS/Android and AsyncStorage on web. Shopping ticks use AsyncStorage and are scoped by server, account, week and ingredient. Disconnect clears the connection and query cache; shopping ticks remain for the same account.

For optional email-code sign-in, copy `.env.example` to `.env.local` in this directory and set `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`. Configure the API's matching Clerk secret and enable email codes in Clerk. Personal tokens remain available. The custom flow uses `@clerk/expo` v4's `signIn.emailCode` and `finalize` APIs and fetches a fresh bearer with `getToken()` per request. Native Clerk client synchronization is disabled because this app uses no Clerk native components. No Clerk credentials are checked into the repository.

## Structure

- `src/app/(tabs)`: Plan, Recipes, Shopping and People/settings.
- `src/app/service/[id].tsx`: cooked weight, dish-up guide, portion removal.
- `src/app/recipe/[id].tsx`: version picker, nutrition, ingredients and steps.
- `src/app/cook/[versionId].tsx`: step navigation, countdown and keep-awake.
- `src/store.tsx`, `src/connect.tsx`: typed API/query access and connection/authentication.
- `src/ui.tsx`, `src/dates.tsx`, `src/recipe-content.tsx`: shared primitives and content.

Metro's SDK 58 defaults resolve the npm workspace and `@feedr/core` TypeScript source, including explicit `.ts` imports; no custom resolver or changes to core are needed. Cook routes carry `recipeId` alongside `versionId`, then fetch the recipe, so reloads work without serializing a version into the URL.

```sh
npm run typecheck
npm test
npm run lint -w @feedr/mobile
npm run export:web -w @feedr/mobile
```

Cook timers belong to the current step; changing steps resets that step's countdown. They track wall-clock time while this screen is open, with no background alarm/notification. Keep-awake and secure storage still need verification on a physical iPhone. Clerk sign-in is typechecked against the installed v4 types but needs a configured instance for end-to-end verification.
