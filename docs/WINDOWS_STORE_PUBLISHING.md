# 🛒 Publishing Personal NAS to Microsoft Partner Center (Windows App Store)

This guide walks you through publishing **Personal NAS** to the **Microsoft Store** using the generated `.appx` package.

---

## 📦 Package Summary

| Property | Value |
|---|---|
| **Package File** | `server/dist/Personal NAS 1.0.0.appx` |
| **Size** | ~182 MB |
| **Architecture** | `x64` (Windows 10 / 11) |
| **Target OS** | Windows 10 Version 1809+ / Windows 11 (Build 17763.0+) |
| **App Identity** | `Irfan.PersonalNAS` |
| **Display Name** | Personal NAS |
| **Asset Icons** | Full UWP suite generated in `server/build/appx/` |

---

## 🚀 Step 1: Register as a Microsoft App Developer

1. Navigate to the [Microsoft Partner Center](https://partner.microsoft.com/dashboard).
2. Sign in with your Microsoft Account.
3. Enroll in the **Windows & Xbox** developer program (individual or company account).
4. Complete account identity verification.

---

## 🏷️ Step 2: Reserve Your App Name & Retrieve Store Identities

1. In Partner Center, go to **Apps and games** > **New product** > **MSIX or PWA app**.
2. Reserve your application name: e.g., `Personal NAS` (or your preferred unique store name).
3. Once reserved, navigate to **Product management** > **Product Identity**.
4. Take note of the three values provided by Microsoft:
   - **Package/Identity/Name** (e.g., `12345YourName.PersonalNAS`)
   - **Package/Identity/Publisher** (e.g., `CN=XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX`)
   - **Package/Properties/PublisherDisplayName** (e.g., `Your Developer Name`)

---

## ⚙️ Step 3: Match Package Identity in `package.json`

Open [server/package.json](file:///C:/Users/irfan/.gemini/antigravity/scratch/personal-nas/server/package.json) and locate the `"appx"` block under `"build"`:

```json
"appx": {
  "identityName": "<Your Package/Identity/Name from Partner Center>",
  "applicationId": "PersonalNAS",
  "publisher": "<Your Package/Identity/Publisher from Partner Center>",
  "publisherDisplayName": "<Your PublisherDisplayName>",
  "displayName": "Personal NAS",
  "backgroundColor": "#0B0F17",
  "showNameOnTiles": true
}
```

Re-generate the `.appx` package with your official Microsoft identity:
```powershell
npm --prefix server run dist:store
```

---

## 📤 Step 4: Create a New Submission in Partner Center

1. In Partner Center, open your app and click **Start your submission**.
2. **Pricing and availability**:
   - Set price to **Free** (or your desired pricing model).
   - Select targeted markets (default: all worldwide markets).
3. **Properties**:
   - Category: **Utilities & tools** > **File management** / **Backup & restore**.
4. **Age ratings**:
   - Complete the standard IARC questionnaire (typically All Ages / 3+ as Personal NAS is a utility).
5. **Packages**:
   - Drag and drop `server/dist/Personal NAS 1.0.0.appx` into the package upload area.
   - Partner Center will validate the package integrity, manifest, and icons automatically.
6. **Store listings**:
   - Provide description, screenshots, and feature highlights (e.g., Liquid Glass UI, RAID storage pools, Cloudflare remote access, Android/iOS synchronization).
7. Click **Submit to the Store**. Certification typically takes 24 to 72 hours.

---

## 🧪 Optional: Local Testing of `.appx` Before Submission

To sideload and test the `.appx` on your local Windows PC without submitting to the store:

1. Enable Developer Mode in Windows:
   - Go to **Windows Settings** > **System** > **For developers** > turn on **Developer Mode**.
2. Right-click `server/dist/Personal NAS 1.0.0.appx` and click **Install**, or run via PowerShell:
   ```powershell
   Add-AppxPackage -Path "server\dist\Personal NAS 1.0.0.appx"
   ```
3. Personal NAS will appear in your Windows Start Menu as a native Windows Store application!
