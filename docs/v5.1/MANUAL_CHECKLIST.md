# V5.1 manual checklist (owner)

Most steps are automated by `npm run test:browser`. These need you. Never
put a screenshot of your key anywhere.

## 1. Live test with your key (required for "fully live-verified")

1. `npm run build`, then in `chrome://extensions` (or `brave://extensions`)
   **Load unpacked** → `dist` (or **Reload** if already loaded).
2. Click the Correctly toolbar button → settings.
3. Paste your key from https://aistudio.google.com/apikey → **Save key** →
   status **Configured**.
4. Click **Test connection** once. Expected: status **Connected** and a
   result like `Connected — Gemini 3.1 Flash-Lite (Gemini) answered "OK"…`.
5. `Tests attempted today` shows `1 of 20`.

If you get "Model not available", select **Gemini 3.5 Flash-Lite**, test
again, and tell me which model works.

## 2. Persistence

1. Close the browser completely and reopen it.
2. Open the settings: key still **Configured/Connected**, model, limit and
   today's counter unchanged.

## 3. Offline

1. Disconnect Wi-Fi/Ethernet → **Test connection** → "Offline or network
   error", counter unchanged.
2. Reconnect → test again → works.

## 4. Optional

- Repeat section 1 in the other browser (keys are per profile).
- In the service worker console (`chrome://extensions` → _service worker_)
  and the Network panel: only `generativelanguage.googleapis.com`, nothing
  in the console.
- Set a monthly spend cap in Google AI Studio / Cloud billing.
