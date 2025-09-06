# Zendesk App Downloader – Chrome Extension

A lightweight Chrome extension that adds a **“Download”** button to the Zendesk Admin → App Builder page.  
It lets you list every version of a private Zendesk app and download the full source code (as a ZIP) in two clicks.

---

## What it does

- Detects when you are on an app-builder page (`https://{subdomain}.zendesk.com/admin/apps-integrations/apps/app-builder/{appId}`)
- Shows every version returned by Zendesk’s internal API
- Re-uses the cookies / headers of your **already-logged-in** Zendesk session – **no extra auth** required
- Packages the chosen version into a ZIP and saves it locally

---

## Folder / File Map

```bash
zendesk-app-downloader/
├─ manifest.json // extension manifest (v3)
├─ messenger.js // page-context helper (captures cookies & headers)
├─ popup.html // tiny UI
├─ popup.js // all download logic lives here
├─ styles.css // popup styling
├─ jszip.min.js // ZIP library (drop-in file)
└─ icons/ // Icons of application
```

---

## Installation (Developer Mode)

1. Download / clone this repo
2. **Open Chrome** → `chrome://extensions`
3. Toggle **“Developer mode”** (top-right)
4. Click **“Load unpacked”** and select the `zendesk-app-downloader` folder
5. The Zendesk icon appears in your toolbar – **done**.

---

## How to use

1. Log in to your Zendesk instance (admin role required)
2. Navigate to  
   `Admin → Apps → App Builder → (choose any app)`
3. Click the extension icon – a popup opens
4. Pick a version → **“Download ZIP”**
5. Save the file; inside you’ll find `blueprint.md`, JSX, CSS, etc.

---

## Troubleshooting

| Problem                             | Fix                                                                           |
| ----------------------------------- | ----------------------------------------------------------------------------- |
| “Not on a Zendesk app-builder page” | Make sure the URL contains `/admin/apps-integrations/apps/app-builder/{uuid}` |
| 401 / 403 in popup                  | Refresh the Zendesk tab (session expired) and reopen popup                    |
| Empty version list                  | Verify your admin role has “Manage apps” permission                           |

---

## Security Notes

- **Zero credentials are stored** – the extension only forwards the browser’s existing cookies.
- Source code is fetched with the **same permissions** your admin user already has.
- No data leaves your machine except the HTTPS calls to your own Zendesk domain.

---

## License

MIT – feel free to fork & improve.
