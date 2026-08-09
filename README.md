<div align="center">

<img src="logo/DataPharm.svg" width="120" alt="DataPharm Logo" />

# DataPharm

**Pharmacy OS for independent medical stores — built for India 🇮🇳**

*The name says it all: **Data** meets **Pharm**. A datafarm for your pharmacy.*

[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![Capacitor](https://img.shields.io/badge/Capacitor-7-119EFF?style=flat-square&logo=capacitor&logoColor=white)](https://capacitorjs.com)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev)
[![Android](https://img.shields.io/badge/Android-APK-3DDC84?style=flat-square&logo=android&logoColor=white)](https://developer.android.com)
[![Offline](https://img.shields.io/badge/Offline-First-22C55E?style=flat-square)](#)
[![License](https://img.shields.io/badge/License-MIT-E02020?style=flat-square)](#)

---

> *Built for the salesman who juggles 3 customers, runs out of change, and still needs to know if Paracetamol is on shelf A or B.*

---

</div>

## What is DataPharm?

Most small Indian pharmacies still track stock by memory or handwritten notes. DataPharm replaces that entirely — giving every salesman a fast, offline-capable POS tool that runs on any Android phone, requires no internet, no account, and no monthly subscription.

Scan barcodes, serve multiple customers at once, bill in seconds, accept UPI, and export reports to PDF, Word, or CSV. All from a ₹8,000 phone.

---

## ✦ Feature Highlights

<table>
<tr>
<td width="50%">

### 📦 Smart Inventory
- Category-aware unit system — strips for tablets, bottles for syrups, vials for injections, tubes for ointments
- Expiry tracking with colour-coded warnings — amber at 60 days, red at 30
- Shelf location badge on every card for instant retrieval
- Barcode field with inline camera scan button
- Restock flow with mandatory expiry date per batch

</td>
<td width="50%">

### 🛒 Multi-Customer Sessions
- Serve up to **10 customers simultaneously**
- Each customer has an isolated cart, search state, and checkout
- Tap the DataPharm logo → slide-in session panel
- Badge count shows active sessions at a glance
- Sessions auto-close on payment confirmation

</td>
</tr>
<tr>
<td width="50%">

### 💸 Billing & Payments
- Build cart by strip or individual tablet/unit
- Percentage discount with live total calculation
- Optional buyer details recorded per sale
- UPI QR popup with total shown below — upload once, appears automatically
- Expired medicine confirmation gate before sale

</td>
<td width="50%">

### 📷 Barcode Scanner
- Powered by **Google ML Kit** — fully on-device, no internet needed
- Supports EAN-13, EAN-8, QR, Code 128, Code 39, UPC-A, UPC-E, Data Matrix
- Match found → opens product detail instantly
- Match not found → offers to create new product with barcode pre-filled
- Available in Online mode only via camera icon in search bar

</td>
</tr>
<tr>
<td width="50%">

### 🕒 History & Exports
- Full log of sales and stock-ins grouped by day
- Filter by All / Sales / Stock-in
- One-tap export to **PDF · Word · CSV · JSON**
- Share via WhatsApp, email, Drive — or save locally

</td>
<td width="50%">

### 🌗 Appearance & Settings
- Dark theme by default (`#0D1117` navy — matches app icon)
- Light theme toggle in Settings
- Three text size options
- Per-notification toggles — low stock, expiry, sale success, sale cancelled
- Currency selector including ₹ Rupee, $ Dollar, € Euro, ¥ Yuan

</td>
</tr>
</table>

---

## 📱 Screenshots

<div align="center">

 <img src="screenshots/house.png" width="200" /> 

</div>

---

## 🛠 Tech Stack

| Layer | Technology | Why |
|---|---|---|
| UI | React 19 + Vite 6 | Fast HMR, component isolation |
| Native shell | Capacitor 7 | Web → Android with native plugin access |
| Styling | Hand-written CSS | Zero dependencies, full control, Inter font |
| Local DB | `localStorage` (`datapharm:v1`) | Offline-first, no setup |
| Barcode | `@capacitor-mlkit/barcode-scanning` | On-device ML, no cloud |
| PDF | jsPDF + jspdf-autotable | Client-side, no server |
| Word | docx | Pure JS DOCX generation |
| Notifications | Capacitor Local Notifications | Native Android push |
| Build | Gradle 8 + Java 21 (Microsoft OpenJDK) | Android APK compilation |

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ and npm
- Android Studio + Android SDK
- Java 21 — `winget install Microsoft.OpenJDK.21` on Windows
- Android phone with **Install from unknown sources** enabled

### Run in browser

```bash
npm install
npm run dev
# → http://localhost:5173
# Append ?demo=1 for sample data
```

### Build APK

```bash
# 1. Build web bundle
npm run build

# 2. Sync to Android
npx cap sync android

# 3. Compile (Windows)
cd android
$env:JAVA_HOME="C:\Program Files\Microsoft\jdk-21.0.12.8-hotspot"
.\gradlew.bat assembleDebug --no-daemon

# 4. Install on device
adb install -r app\build\outputs\apk\debug\app-debug.apk
```

> **SDK not found?** Create `android/local.properties` with:
> ```
> sdk.dir=C:/Users/YOUR_USERNAME/AppData/Local/Android/Sdk
> ```

---

## 📁 Project Structure

```
DataPharm/
├── android/                        # Capacitor Android shell
│   └── app/src/main/
│       ├── AndroidManifest.xml     # Camera permission + ML Kit config
│       └── java/com/datapharm/app/ # Custom native plugins
├── logo/                           # SVG logo assets
├── public/                         # Favicon, splash screen
├── screenshots/                    # README screenshots
├── scripts/                        # UI verification + icon generation
├── src/
│   ├── components/
│   │   ├── Confirm.jsx             # Reusable confirmation dialog
│   │   ├── Icons.jsx               # All SVG icon components
│   │   ├── PermissionDialog.jsx    # Camera / notification permission UI
│   │   ├── ProductForm.jsx         # Add / edit product form
│   │   ├── SellingPanel.jsx        # Cart, discount, checkout, payment
│   │   ├── SessionPanel.jsx        # Multi-customer session manager
│   │   └── Sheet.jsx               # Bottom sheet component
│   ├── lib/
│   │   ├── back.js                 # Android hardware back button
│   │   ├── export.js               # PDF / DOCX / CSV / JSON logic
│   │   ├── notifications.js        # Local notification scheduling
│   │   ├── permissions.js          # Camera + notification helpers
│   │   ├── pricing.js              # Unit price + line total calculations
│   │   ├── store.js                # localStorage DB — load, persist, clear
│   │   └── sync.js                 # WebRTC P2P sync engine (in progress)
│   ├── screens/
│   │   ├── Dashboard.jsx           # Home — search, product list, sessions
│   │   ├── History.jsx             # Sales + stock-in log, exports
│   │   ├── Settings.jsx            # Preferences, QR, theme, notifications
│   │   └── Stock.jsx               # Inventory, detail sheet, restock
│   ├── App.jsx                     # Root — navigation, sessions, sell flow
│   ├── main.jsx                    # React entry point
│   └── styles.css                  # All styles — tokens, dark/light themes
├── capacitor.config.json
├── index.html
├── package.json
└── vite.config.js
```

---

## 🗄 Data Model

All data lives in one localStorage key — `datapharm:v1`:

```json
{
  "products": [{
    "id": "uuid",
    "name": "Vicodin",
    "category": "Tablet",
    "location": "Shelf H",
    "barcode": "842634600177",
    "supplier": "Dr Gregory House",
    "price": 1500,
    "strips": 10,
    "tabletsPerStrip": 30,
    "expiry": "2004-11"
  }],
  "sales": [{
    "id": "uuid",
    "ts": 1722765432000,
    "items": [{ "name": "Vicodin", "qty": 2, "unit": "strip", "price": 30 }],
    "discountPct": 10,
    "total": 54,
    "buyer": { "name": "James Wilson", "phone": "(609) 555-0200" }
  }],
  "stockIns": [{ "id": "uuid", "ts": 1722765432000, "productId": "uuid", "strips": 5 }],
  "settings": {
    "currency": "₹",
    "fontSize": "md",
    "onlineMode": false,
    "themeMode": "dark",
    "notifications": { "lowStock": true, "expiringSoon": true, "saleSuccess": true }
  }
}
```

---

## 🗺 Roadmap

- [ ] **WebRTC P2P sync** — two devices, same shop, no cloud, no router required
- [ ] **QR shop pairing** — scan once to pair devices permanently
- [ ] **Green / yellow / red stock states** — soft reservations across devices
- [ ] **Owner / worker roles** — access expiry, daily QR verification
- [ ] **Market price comparison** — store price vs current online rate (online mode)
- [ ] **Vendor ordering** — order restocks directly from distributors (online mode)
- [ ] **Play Store release** — signed APK, production ready

---

## 🤝 Contributing

DataPharm is purpose-built for small Indian pharmacies. If you work at or run a medical store and have workflow-based feature suggestions — open an issue. Real use-case feedback is worth more than anything else.

---

## 📄 License

MIT — use it, fork it, build on it, sell it.

---

<div align="center">

**Built with intention for neighbourhood pharmacies across India**

*If this helped your store, star the repo ⭐*

</div>
