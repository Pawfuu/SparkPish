🌟 E-Tapon Mo: Crowdsourced Waste Mapper
A decentralized, AI-powered crowdsourced waste management platform designed to transform reactive municipal garbage collection into a proactive, data-driven methodology.

🚀 About the Project
This project is developed as part of SparkFest 2026, a hackathon organized by Google Developer Groups on Campus – Polytechnic University of the Philippines (GDG PUP). It aims to bridge the gap between municipal waste management policies and actual field compliance through technology, innovation, and community collaboration.

🎯 Problem Statement
The Philippines is facing a critical infrastructural deficit in municipal solid waste (MSW) management, exacerbated by rapid urbanization. Despite the mandates of the Ecological Solid Waste Management Act (Republic Act No. 9003), compliance remains low, with less than 40% of the nationwide MRF requirement met and a growing proliferation of illegal open dumpsites.
Municipal planners often struggle with:
Data Deficits: Lack of real-time spatial data on waste generation and illegal dumping hotspots.
Legacy Systems: Reliance on manual audits and cumbersome reporting that creates significant lag times between incidents and cleanup dispatch.
Infrastructural Vulnerability: High-latency, low-connectivity zones that render traditional mobile apps ineffective.

💡 Proposed Solution
"E-Tapon Mo" is a Progressive Web App (PWA) that empowers citizens to become active environmental sensors.
What it does: It allows citizens to scan a QR code on barangay bulletin boards to access the platform instantly—no app store download required. Users simply upload a photo of uncollected waste or an illegal dumpsite.
How it works: The system uses the Gemini API to autonomously categorize the image by volume, material type, and severity. This data is geolocated and visualized via the Google Maps JavaScript API as a dynamic heatmap for municipal dispatchers.
Differentiation: Its offline-first PWA architecture ensures that reports can be captured even in 2G or complete offline conditions, automatically syncing when a connection is restored, ensuring equitable participation across all socioeconomic strata.

⚙️ Features
AI-Automated Categorization: Bypasses manual entry errors by using Gemini AI to identify and tag waste (e.g., "Organic Decay," "Hazardous/E-Waste").
Dynamic Heatmap Visualization: Provides environment officers with real-time "red zones" to prioritize clearing operations.
Offline Resilience: Utilizes Firebase persistent caching and IndexedDB to ensure no data is lost in connectivity dead zones.
Accountability & Compliance Tracking: Generates timestamped, geolocated digital evidence that helps LGUs meet the "Environmental Management" pillars required for the Seal of Good Local Governance (SGLG).

🧪 Tech Stack
Frontend: Progressive Web App (PWA)
Backend/Integration: Gemini API (Vision/Categorization), Google Maps JavaScript API
Database: Firebase Realtime Database (with Firestore offline persistence)
Tools: GitHub (Version Control)
