<div align="center">

<img width="2048" height="413" alt="E-Tapon Mo Header" width="100%" src="https://github.com/user-attachments/assets/06e75dc7-093b-4847-bd79-6ec023a715e4" />

<p align="center">
  A frictionless, AI-assisted, real-time community waste reporting platform connecting citizens with Local Government Units (LGUs) for real-time waste management.
</p>

<p align="center">
  <strong>Developed by Team SparkPish:</strong><br>
  Hesed Suñga &bull; Keziah Magtibay &bull; Christian Olano &bull; Dyan Tapiador<br>
  <em>for SparkFest 2026</em>
</p>

<a href="#about"><img src="https://img.shields.io/badge/💡_About-blue?style=for-the-badge" alt="About"></a>
<a href="#features"><img src="https://img.shields.io/badge/✨_Features-purple?style=for-the-badge" alt="Features"></a>
<a href="#demo"><img src="https://img.shields.io/badge/🌐_Demo-orange?style=for-the-badge" alt="Live Demo"></a>
<a href="#installation"><img src="https://img.shields.io/badge/⚙️_Installation-green?style=for-the-badge" alt="Installation"></a>
<a href="#preview"><img src="https://img.shields.io/badge/📷 Previews-red?style=for-the-badge" alt="Preview"></a>

<br>

</div>

---

> [!TIP]
> Scan the QR Code in the hero banner (once generated) to immediately open the citizen reporting web application on your mobile device.

<div id="about"></div>

## 🚀 About the Project

This project is developed as part of **SparkFest 2026**, a hackathon organized by **Google Developer Groups on Campus – Polytechnic University of the Philippines (GDG on Campus PUP)**.

The project aims to bridge the gap between municipal waste management policies and real-world implementation by leveraging AI, real-time cloud technologies, and community participation to improve waste reporting and response.

> [!NOTE]
> For a comprehensive overview of our development strategy, urbanization research, and community impact goals, please read our full **[Project Brief / Overview](https://docs.google.com/document/d/1WQ6l98iAIJKUQi1jfdTixk6JQkpZnFz_06-UeEMLn9M/edit?tab=t.nimvz5l2j3wy)**.

### 🎯 Problem Statement

The Philippines is facing a critical infrastructural deficit in municipal solid waste (MSW) management, exacerbated by rapid urbanization. Despite the comprehensive legislative framework of Republic Act 9003 (Ecological Solid Waste Management Act of 2000), compliance remains low, with less than 40% of the nationwide MRF requirement met and a growing proliferation of illegal open dumpsites. Municipal planners often struggle with:

- **Inconsistent Enforcement:** Rapid urbanization and limited LGU resources have led to persistent increases in solid waste volume and overstrained landfills.
- **Manual Bottlenecks:** Existing government initiatives, like the DENR-EMB's "Basura Patrol", heavily rely on manual data entry and third-party social media accounts for crowdsourced visual data.
- **The Result:** This creates a systemic gap in environmental governance, leading to the proliferation of illegal open dumpsites, polluted drainage systems, and severe public health risks.

> [!IMPORTANT]
> **Target Beneficiaries**
>
> **E-Tapon Mo** is designed to serve **Local Government Units (LGUs)** and the **urban/rural communities** they support. Its primary beneficiaries include:
>
> - 🏛️ City and Municipal Sanitation Offices
> - 🏘️ Barangay Officials
> - 👥 Residents in densely populated communities
> - 🌱 Environmental and waste management personnel
>
> By enabling faster reporting and real-time monitoring, the platform helps communities respond to illegal dumping more efficiently while improving citizen participation.

### 💡 The Solution

**E-Tapon Mo** is a Progressive Web Application (PWA) that streamlines community-based waste reporting by combining AI-assisted image validation, interactive mapping, and Firebase's real-time infrastructure. Citizens can instantly report illegal dumping or uncollected waste using any smartphone browser—no app installation or account registration required. Each report is automatically validated, categorized, and prioritized by Google's Gemini AI before being synchronized to a centralized LGU dashboard, enabling faster, data-driven cleanup operations and more efficient environmental management.

> [!IMPORTANT]
>
> - **Frictionless Submission**: Citizens snap a photo of a trash site, select a category, pin a location on the map, and hit Submit — no account creation or login flow required.
> - **AI Spam Filtering & Validation**: Google's Gemini AI automatically validates the image to filter out spam (e.g. non-waste photos), estimates the waste volume, and assigns a severity score (1-5).
> - **Real-Time Dispatch Dashboard**: LGU Administrators get a dedicated real-time portal that instantly populates with new verified reports, enabling city planners to deploy clearing operations before sanitation hazards escalate.

---

<div id="features"></div>

## ✨ Key Features

Our platform is divided into two seamless experiences: a public-facing reporting tool and an LGU administrative dashboard.

### 👥 Citizen Reporting Site (`/user-app`)

| Feature                        | Description                                                                         |
| ------------------------------ | ----------------------------------------------------------------------------------- |
| 📸 **Photo Capture**           | Upload or snap a photo directly from a mobile camera                                |
| 🤖 **AI Spam Filtering**       | Gemini 3.1 Flash Lite validates each image — rejects non-trash photos automatically |
| 📊 **AI Analysis**             | Returns a volume estimate and a severity score from 1 to 5                          |
| 🗺️ **Interactive Map Pinning** | Leaflet-powered modal map with a draggable marker and click-to-place support        |
| 📍 **GPS Geolocation**         | "Use My Current GPS" button auto-pins the user's live location                      |
| 🔍 **Address Autocomplete**    | Nominatim-powered search with debounced suggestions (restricted to PH)              |
| 📋 **Guided 4-Step Flow**      | Visual progress stepper: `Snap Photo → Fill Details → Pin Location → Submit`        |
| 🏷️ **Waste Categorization**    | Recyclable, Non-recyclable, Nabubulok (Organic), Hazardous Waste                    |
| ✅ **Success / Error Modals**  | Flash modals communicate report outcomes clearly with no page refresh               |
| 🌙 **Dark Mode**               | Full dark/light mode toggle with system preference detection                        |
| 📱 **Mobile-First Design**     | Responsive layout optimized for street-level field reporting                        |

> [!WARNING]  
> Reports containing no visible waste or violating safety protocols are automatically rejected by the Gemini API before reaching the LGU database to ensure dispatch efficiency.

### 🏛️ LGU Admin Dashboard (`/lgu-dashboard`)

| Feature                    | Description                                                                         |
| -------------------------- | ----------------------------------------------------------------------------------- |
| 📡 **Real-Time Sync**      | Firestore `onSnapshot` listener pushes new reports instantly, no page reload needed |
| 📊 **Live Metric Cards**   | Total Reports, Pending, In Progress, and Resolved counts update live                |
| 🗂️ **Card & Table View**   | Toggle between a visual card grid and a sortable data table                         |
| 🔍 **Search & Filter**     | Filter reports by keyword, status, and waste category                               |
| 🔃 **Sorting**             | Sort by Severity, Date, or Waste Category                                           |
| 🖼️ **Report Detail Modal** | Full drill-down view with photo, AI analysis results, location, reporter info       |
| ✏️ **Status Management**   | Update report status (Pending → In Progress → Resolved) directly from the dashboard |
| 🍞 **Toast Notifications** | Non-intrusive toast feedback for status updates and actions                         |
| 🔐 **LGU Authentication**  | Password-protected admin login to prevent unauthorized access                       |
| 📤 **Export**              | Export report data for offline review                                               |
| 🔔 **New Report Alerts**   | Dashboard alerts the admin when a new report arrives in real-time                   |

<br>

---

<div id="preview"></div>

## 🎥 Feature Demonstrations

### 👤 Citizen Reporting Flow

> Demonstrates the complete reporting workflow:
> **Scan QR → Upload Photo → Fill Details → Pin Location → Submit**

### 🤖 AI Image Validation

|                                 ✅ Successful Report                                 |                             ❌ Invalid Submission                              |
| :----------------------------------------------------------------------------------: | :----------------------------------------------------------------------------: |
| <img src="/SparkPish/user-app/assets/success.gif width="100%" alt="Successful Flow"> | <img src="/SparkPish/user-app/assets/Error.gif" width="100%" alt="Error Flow"> |

### 🏛️ LGU Dashboard

> Real-time synchronization, filtering, sorting, and status updates.

|                                     Dashboard Overview                                     |
| :----------------------------------------------------------------------------------------: |
| <img src="/SparkPish/user-app/assets/dashboard.gif" width="100%" alt="Dashboard Overview"> |

|                                Real-Time Maps                                |
| :--------------------------------------------------------------------------: |
| <img src="/SparkPish/user-app/assets/maps.gif" width="100%" alt="Maps View"> |

|                                   Civic Reports                                    |
| :--------------------------------------------------------------------------------: |
| <img src="/SparkPish/user-app/assets/reports.gif" width="100%" alt="Reports View"> |

|                                     AI Analysis                                      |
| :----------------------------------------------------------------------------------: |
| <img src="/SparkPish/user-app/assets/Analysis.gif" width="100%" alt="Analysis View"> |

> [!IMPORTANT]
> **Prototype Scope**
>
> This repository contains the **hackathon MVP** of E-Tapon Mo. The current implementation focuses on the platform's core workflow: AI-assisted waste reporting, real-time dashboard synchronization, interactive mapping, and report management.
>
> Some dashboard modules shown in the interface represent **planned future enhancements** and are intentionally non-functional in this prototype.

- 🔒 **Barangay Performance** — Coming Soon
- 🔒 **Task Management** — Planned
- 🔒 **Collection Routes** — Planned
- 🔒 **AI Insights** — Future Release

---

## 🧰 Tech Stack

### 🔵 Google Technologies

| Technology                               | Usage                                                          |
| ---------------------------------------- | -------------------------------------------------------------- |
| **Gemini API** (`gemini-3.1-flash-lite`) | AI image validation, waste volume estimation, severity scoring |
| **Firebase Cloud Firestore**             | Real-time NoSQL database for storing and listening to reports  |
| **Firebase Cloud Storage**               | Stores uploaded trash photo images                             |
| **Firebase Hosting**                     | Deploys the entire app publicly via CDN                        |
| **Google Fonts** (`Inter`)               | Clean, modern typography across all pages                      |

### 🎨 Frontend Frameworks & Libraries

| Technology                                   | Usage                                                         |
| -------------------------------------------- | ------------------------------------------------------------- |
| **Vanilla HTML5 & JavaScript (ES6 Modules)** | Core structure and application logic — no build step required |
| **Tailwind CSS (via CDN)**                   | Utility-first styling, dark mode, and responsive layouts      |
| **Leaflet.js**                               | Interactive maps, draggable pins, and tile rendering          |

### 🔌 Additional Technologies & Integrations

| Technology                    | Usage                                                                       |
| ----------------------------- | --------------------------------------------------------------------------- |
| **Nominatim (OpenStreetMap)** | Reverse geocoding (coordinates → readable address) and address autocomplete |
| **OpenStreetMap Tiles**       | Map tile rendering inside the Leaflet modal                                 |
| **Browser Geolocation API**   | GPS-based auto-pinning of the user's current location                       |

---

<div id="installation"></div>

## 🛠️ Local Setup & Installation

> **Prerequisites:** A modern browser and a local HTTP server (e.g., VS Code Live Server). Node.js is **not required** — the project uses native ES Modules served via CDN.

### Step 1 — Clone the Repository

```bash
git clone https://github.com/Pawfuu/SparkPish.git
cd SparkPish
```

### Step 2 — Set Up Firebase Credentials

1. Go to your [Firebase Console](https://console.firebase.google.com/) and create or select a project.
2. Enable **Cloud Firestore**, **Firebase Storage**, and **Firebase Hosting**.
3. Register a **Web App** and copy the config object.
4. Duplicate the example config file and fill in your credentials:

```bash
cp shared/firebase-example-config.js shared/firebase-config.js
```

Then open `shared/firebase-config.js` and replace the placeholder values with your Firebase project settings.

> [!IMPORTANT]
> The LGU Admin Dashboard requires administrator configuration/credentials (or can be accessed via the `/lgu-dashboard` path).

### Step 3 — Set Up the Gemini API Key

1. Get a free API key from [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Duplicate the example config:

```bash
cp user-app/config-example.js user-app/config.js
```

3. Open `user-app/config.js` and replace `YOUR_GEMINI_API_KEY_HERE` with your actual key.

> [!WARNING]
> Firebase configuration (`firebase-config.js`) and Gemini API keys (`config.js`) are intentionally gitignored. Ensure you follow the **Installation** steps before running the app.

### Step 4 — Run Locally

This project uses native ES Modules (`import`/`export`), so it **must be served over HTTP** — opening `index.html` directly as a file will not work.

**Run Through IDEs with Live Server** _(Recommended: VS Code)_

- Install the [Live Server](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer) extension
- Right-click `index.html` → **Open with Live Server**

---

<div id="demo"></div>

## 🌐 Live Demo

The app is deployed and publicly accessible via **Firebase Hosting**:

| Page                     | URL                                                      |
| ------------------------ | -------------------------------------------------------- |
| 👤 Citizen Reporting App | https://sparkpish-eco-mvp.web.app/user-app/index.html    |
| 🏛️ LGU Admin Dashboard   | https://sparkpish-eco-mvp.web.app/lgu-dashboard/lgu.html |
