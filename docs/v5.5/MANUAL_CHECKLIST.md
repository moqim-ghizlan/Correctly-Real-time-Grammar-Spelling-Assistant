# V5.5 manual checklist (owner)

Before you start:

1. Run `npm run build`.
2. Click **Reload** in `chrome://extensions`.
3. Make sure a key is saved and **Correction** is ticked in the settings.

Use test sentences only.

## 1. French → Syrian Arabic

1. In a textarea, type `Salut, tu peux me dire quand tu seras libre demain ?`
   and select it.
2. Right-click → **Correctly → Translate selected text…**. The picker opens.
   The request counter in the settings must not move yet.
3. Choose From **Auto-detect**, To **Arabic**, variant **Syrian colloquial**,
   then click **Translate**.
4. Expected:
   - one card, displayed right to left;
   - natural Syrian Arabic, not Modern Standard Arabic;
   - the question meaning is kept;
   - the counter increases by 1.
5. Click **Apply**, then **Undo translation**.

## 2. Translate & rewrite

1. Select `Je ne peux pas venir demain.`, then right-click →
   **Translate & rewrite…**.
2. Choose To **English**, tick **Formal** and **Friendly**, then click
   Translate.
3. Expected:
   - 2 cards, labeled "Formal → English" and "Friendly → English";
   - the negation and "tomorrow" are kept;
   - the counter increases by 1.

## 3. Same language

- Choose From **French** and To **French**. The Translate button is disabled
  and the panel suggests Rewrite.
- Select an English sentence and choose To **English** with Auto. The panel
  says the text is already in English.

## 4. Other directions

Check each pair and note any error in meaning:

- EN → FR
- TR → EN
- FR → TR
- EN → DE
- ES → EN
- `بكرا ما رح أقدر أجي لأن عندي شغلة.` → FR, with style Formal
- FR → Arabic, Modern Standard Arabic
- `Bonjour! Can we meet demain at 14h ?` → EN: `14h` and the meaning must be
  kept.

## 5. Safety

- **Password field:** nothing opens and nothing is sent.
- **Text edited while waiting:** Apply is disabled and Copy still works.
- **Offline:** the panel shows an error, the text is unchanged, and **Try
  again** is offered.

## 6. Settings

1. In **Translation**, set To = Arabic and the variant to Syrian.
2. Reopen the browser and open the picker. The defaults are kept.

Report any failed step with its number, and have a Syrian Arabic speaker
judge the dialect if you can.
