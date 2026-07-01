/**
 * LGU Administrator Portal — live Firestore dashboard
 *
 * - Real-time reports via onSnapshot("reports")
 * - View switching, search, sort, modal drill-down
 * - Status updates written back with updateDoc
 */

import { db } from "../shared/firebase-config.js";
import {
  collection,
  onSnapshot,
  doc,
  updateDoc,
  query,
  orderBy,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

(function () {
  "use strict";

  const STATUS_TO_UI = {
    pending: "Pending Verification",
    "in progress": "In Progress",
    in_progress: "In Progress",
    resolved: "Resolved",
  };

  const STATUS_TO_FIRESTORE = {
    "Pending Verification": "pending",
    "In Progress": "in_progress",
    Resolved: "resolved",
  };

  const PLACEHOLDER_IMAGE =
    "https://images.unsplash.com/photo-1530587191325-3db32d826c18?q=80&w=400&auto=format&fit=crop";

  function normalizeStatus(rawStatus) {
    const key = String(rawStatus || "pending").trim().toLowerCase();
    return STATUS_TO_UI[key] || "Pending Verification";
  }

  function normalizeCategory(rawCategory) {
    if (!rawCategory) return "Uncategorized";
    const cat = String(rawCategory).trim().toLowerCase();

    // Mappings from the misaligned user-app values to match what the user chose
    const legacyMapping = {
      "organic": "Recyclable",
      "plastic": "Non-recyclable",
      "construction": "Hazardous Waste",
      "mixed": "Nabubulok"
    };

    if (legacyMapping[cat]) {
      return legacyMapping[cat];
    }

    // Capitalize first letter of category if it's already a clean string
    return rawCategory.charAt(0).toUpperCase() + rawCategory.slice(1);
  }

  function showToast(featureName) {
    let container = document.getElementById("toast-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "toast-container";
      container.className = "fixed bottom-5 right-5 z-[9999] flex flex-col gap-3";
      document.body.appendChild(container);
    }

    const toast = document.createElement("div");
    toast.className = "flex items-center gap-3 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-xl text-sm font-medium transform transition-all duration-300 translate-y-10 opacity-0";
    toast.innerHTML = `
      <span class="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-400">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
      </span>
      <div>
        <p class="font-bold text-slate-100">${featureName}</p>
        <p class="text-[10px] text-slate-400">This feature will be added in the next update.</p>
      </div>
    `;
    container.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.remove("translate-y-10", "opacity-0");
    });

    setTimeout(() => {
      toast.classList.add("translate-y-10", "opacity-0");
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  function mapDocToReport(docSnap) {
    const data = docSnap.data();

    // Safely parse the location whether it's a string or an object
    let safeLocation = "Unknown Location";
    if (typeof data.location === "string") {
      safeLocation = data.location;
    } else if (typeof data.location === "object" && data.location !== null) {
      // Extract the human-readable address from the object
      safeLocation = data.location.display_name || data.location.address || data.location.name || "Map Pin Location";
    }

    return {
      docId: docSnap.id,
      reportId: docSnap.id,
      id: docSnap.id.slice(0, 8).toUpperCase(),
      category: normalizeCategory(data.wasteType),
      location: safeLocation,
      coordinates: data.coordinates || null,
      submittedBy: data.reporterName || "Anonymous",
      contactInfo: data.contactInfo || "Not Provided",
      status: normalizeStatus(data.status),
      aiVolume: data.volumeEstimate || "N/A",
      severity: data.severityScore != null ? Number(data.severityScore) : 0,
      notes: data.notes || "",
      imageUrl: data.imageUrl || null,
      createdAt: data.createdAt?.toDate?.() || null,
    };
  }

  let reports = [];
  let lastFilteredReports = [];
  let currentPage = 1;
  const itemsPerPage = 8;
  let selectedReport = null;
  let unsubscribeReports = null;

  // Map Variables
  let mapInstance = null;
  let markerLayerGroup = null;
  let dashboardMapInstance = null;
  let dashboardLayerGroup = null;
  let activeMapStatusFilter = "all";
  let activeMapCategoryFilter = "all";
  let showSeverityLow = true;
  let showSeverityMedium = true;
  let showSeverityHigh = true;
  let showMarkers = true;
  let heatLayer = null;
  let showHeatmap = false;

  // DOM Elements
  const navDashboardBtn = document.getElementById("nav-dashboard");
  const navReportsBtn = document.getElementById("nav-reports");
  const navMapBtn = document.getElementById("nav-map");
  const navAnalyticsBtn = document.getElementById("nav-analytics");
  const navSettingsBtn = document.getElementById("nav-settings");

  const viewDashboardPanel = document.getElementById("view-dashboard-panel");
  const viewReportsPanel = document.getElementById("view-reports-panel");
  const viewMapPanel = document.getElementById("view-map-panel");
  const viewTitle = document.getElementById("view-title");
  const mainHeader = document.getElementById("main-header");

  const statActiveEl = document.getElementById("stat-active");
  const statPendingEl = document.getElementById("stat-pending");
  const statProgressEl = document.getElementById("stat-progress");
  const statResolvedEl = document.getElementById("stat-resolved");

  const reportsTableBody = document.getElementById("reports-table-body");
  const reportSearchInput = document.getElementById("report-search-input");
  const sortSelect = document.getElementById("sort-select");
  const tableResultsCounter = document.getElementById("table-results-counter");

  const reportDetailModal = document.getElementById("report-detail-modal");
  const modalReportId = document.getElementById("modal-report-id");
  const modalCategory = document.getElementById("modal-category");
  const modalLocation = document.getElementById("modal-location");
  const modalSubmitter = document.getElementById("modal-submitter");
  const modalAiVolume = document.getElementById("modal-ai-volume");
  const modalSeverityScore = document.getElementById("modal-severity-score");
  const modalNotes = document.getElementById("modal-notes");
  const modalContactInfo = document.getElementById("modal-contact-info");
  const modalStatusBadge = document.getElementById("modal-status-badge");
  const modalStatusSelect = document.getElementById("modal-status-select");
  const modalReportImage = document.getElementById("modal-report-image");

  const closeModalBtn = document.getElementById("close-modal-btn");
  const modalBtnCloseSecondary = document.getElementById("modal-btn-close-secondary");
  const modalBtnSave = document.getElementById("modal-btn-save");

  // --- CORE INITIALIZATION ---
  function init() {
    setupEventListeners();
    updateDateDisplay();
    initLeafletMap();
    refreshMapSizes(100);
    subscribeToReports();

    window.addEventListener("beforeunload", () => {
      if (unsubscribeReports) unsubscribeReports();
    });
  }

  function refreshMapSizes(delay) {
    setTimeout(function () {
      if (window.mapInstance) window.mapInstance.invalidateSize();
      if (window.dashboardMapInstance) window.dashboardMapInstance.invalidateSize();
    }, delay);
  }

  function syncMapGlobals() {
    window.mapInstance = mapInstance;
    window.dashboardMapInstance = dashboardMapInstance;
  }

  function subscribeToReports() {
    const reportsQuery = query(collection(db, "reports"), orderBy("createdAt", "desc"));
    unsubscribeReports = onSnapshot(
      reportsQuery,
      (snapshot) => {
        reports = snapshot.docs.map(mapDocToReport);
        updateCategoryDropdown(reports);
        updateDashboardMetrics(reports);
        renderReportsTable();
        if (typeof updateRecentCriticalAlerts === "function") updateRecentCriticalAlerts();
        if (typeof renderMapMarkers === "function") renderMapMarkers();

        if (selectedReport) {
          const fresh = reports.find((r) => r.docId === selectedReport.docId);
          if (fresh) {
            selectedReport = fresh;
            populateModal(fresh);
          }
        }
      },
      (error) => {
        console.error("Firestore onSnapshot error:", error);
        if (statActiveEl) statActiveEl.textContent = "!";
        alert("Could not load reports from Firestore.\n\n" + error.message);
      }
    );
  }

  function updateDateDisplay() {
    const options = { weekday: "long", year: "numeric", month: "long", day: "numeric" };
    const dateEl = document.getElementById("header-date");
    if (dateEl) dateEl.textContent = new Date().toLocaleDateString("en-US", options);
  }

  function updateCategoryDropdown(reportsList) {
    const categories = Array.from(new Set(reportsList.map(r => r.category).filter(Boolean)));
    categories.sort();

    // 1. Reports View Custom Dropdown
    const reportsCatMenu = document.getElementById("reports-dropdown-category-menu");
    const reportsCatText = document.getElementById("reports-dropdown-category-text");

    if (reportsCatMenu) {
      reportsCatMenu.innerHTML = `<div class="px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 cursor-pointer transition-colors" data-value="all">All Categories</div>`;
      categories.forEach(cat => {
        const optionDiv = document.createElement("div");
        optionDiv.className = "px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 cursor-pointer transition-colors";
        optionDiv.dataset.value = cat;
        optionDiv.textContent = cat.charAt(0).toUpperCase() + cat.slice(1);
        reportsCatMenu.appendChild(optionDiv);
      });

      // Bind click events
      reportsCatMenu.querySelectorAll("div[data-value]").forEach(opt => {
        opt.addEventListener("click", (e) => {
          e.stopPropagation();
          currentCategoryFilter = e.target.dataset.value;
          if (reportsCatText) reportsCatText.textContent = e.target.textContent;
          reportsCatMenu.classList.add("hidden");
          currentPage = 1;
          renderReportsTable();
        });
      });
    }

    // 2. Map View Custom Dropdown
    const mapCatMenu = document.getElementById("dropdown-category-menu");
    const mapCatText = document.getElementById("dropdown-category-text");

    if (mapCatMenu) {
      mapCatMenu.innerHTML = `<div class="px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 cursor-pointer transition-colors" data-value="all">All Categories</div>`;
      categories.forEach(cat => {
        const optionDiv = document.createElement("div");
        optionDiv.className = "px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 cursor-pointer transition-colors";
        optionDiv.dataset.value = cat;
        optionDiv.textContent = cat.charAt(0).toUpperCase() + cat.slice(1);
        mapCatMenu.appendChild(optionDiv);
      });

      mapCatMenu.querySelectorAll("div[data-value]").forEach(opt => {
        opt.addEventListener("click", (e) => {
          e.stopPropagation();
          activeMapCategoryFilter = e.target.dataset.value;
          if (mapCatText) mapCatText.textContent = e.target.textContent;
          mapCatMenu.classList.add("hidden");
          renderMapMarkers();
        });
      });
    }
  }

  function formatReportedAt(date) {
    if (!date) return "N/A";
    const options = { month: "short", day: "numeric" };
    const formattedDate = date.toLocaleDateString("en-US", options);

    let hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12;
    hours = hours ? hours : 12; // the hour '0' should be '12'
    const strMinutes = minutes < 10 ? "0" + minutes : minutes;

    return `${formattedDate}, ${hours}:${strMinutes} ${ampm}`;
  }

  function renderPaginationControls(totalPages) {
    const container = document.getElementById("pagination-controls");
    if (!container) return;
    container.innerHTML = "";

    if (totalPages <= 1) return; // Hide pagination if only 1 page

    // Helper to append a button
    function createPageBtn(label, pageNum, disabled = false, isActive = false) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.disabled = disabled;

      if (isActive) {
        btn.className = "px-2.5 py-1 text-xs font-bold rounded-lg border border-emerald-600 bg-emerald-50 text-emerald-800 transition-colors";
      } else if (disabled) {
        btn.className = "p-1 text-slate-300 pointer-events-none";
      } else {
        btn.className = "px-2.5 py-1 text-xs font-medium rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors cursor-pointer";
      }

      btn.innerHTML = label;
      if (!disabled) {
        btn.addEventListener("click", () => {
          currentPage = pageNum;
          renderReportsTable();
        });
      }
      return btn;
    }

    // Previous button
    const prevBtn = createPageBtn(
      `<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" /></svg>`,
      currentPage - 1,
      currentPage === 1
    );
    container.appendChild(prevBtn);

    // Calculate page range to show
    let range = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) range.push(i);
    } else {
      if (currentPage <= 4) {
        range = [1, 2, 3, 4, 5, "...", totalPages];
      } else if (currentPage >= totalPages - 3) {
        range = [1, "...", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
      } else {
        range = [1, "...", currentPage - 1, currentPage, currentPage + 1, "...", totalPages];
      }
    }

    // Render page buttons
    range.forEach(item => {
      if (item === "...") {
        const dot = document.createElement("span");
        dot.className = "px-1 text-slate-400 font-bold select-none text-xs";
        dot.textContent = "...";
        container.appendChild(dot);
      } else {
        const pageBtn = createPageBtn(item.toString(), item, false, item === currentPage);
        container.appendChild(pageBtn);
      }
    });

    // Next button
    const nextBtn = createPageBtn(
      `<svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" /></svg>`,
      currentPage + 1,
      currentPage === totalPages
    );
    container.appendChild(nextBtn);
  }

  function exportToCSV() {
    const dataToExport = lastFilteredReports.length > 0 ? lastFilteredReports : reports;
    if (dataToExport.length === 0) {
      alert("No reports available to export.");
      return;
    }

    // CSV Headers
    const headers = [
      "Report ID",
      "Category",
      "Location Address",
      "Latitude",
      "Longitude",
      "Status",
      "Priority",
      "Submitted By",
      "Contact Info",
      "AI Volume Estimate",
      "Severity Score",
      "Notes",
      "Reported At"
    ];

    // Convert rows to CSV strings
    const csvRows = [headers.join(",")];

    dataToExport.forEach(report => {
      let lat = "";
      let lng = "";
      if (report.coordinates) {
        if (report.coordinates.lat != null) lat = report.coordinates.lat;
        if (report.coordinates.lng != null) lng = report.coordinates.lng;
      }

      let priorityText = "Low";
      if (report.severity >= 4) {
        priorityText = "High";
      } else if (report.severity === 3) {
        priorityText = "Medium";
      }

      const row = [
        `#${report.id}`,
        report.category,
        report.location,
        lat,
        lng,
        report.status,
        priorityText,
        report.submittedBy,
        report.contactInfo,
        report.aiVolume,
        report.severity,
        report.notes,
        report.createdAt ? report.createdAt.toISOString() : "N/A"
      ];

      // Escape quotes and wrap cell values in double quotes
      const escapedRow = row.map(val => {
        const strVal = String(val == null ? "" : val).replace(/"/g, '""');
        return `"${strVal}"`;
      });
      csvRows.push(escapedRow.join(","));
    });

    // Create a blob and download it
    const csvString = csvRows.join("\n");
    const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);

    link.setAttribute("href", url);
    link.setAttribute("download", `basura_pin_reports_${new Date().toISOString().slice(0, 10)}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function updateDashboardMetrics(reports) {
    // 1. Dashboard View Stats
    const activeCount = reports.filter((r) => r.status !== "Resolved").length; // Active non-resolved reports
    const criticalCount = reports.filter((r) => r.severity >= 4 && r.status !== "Resolved").length; // Active severity >= 4
    const pendingCount = reports.filter((r) => r.status === "Pending Verification").length;
    const resolvedCount = reports.filter((r) => r.status === "Resolved").length;
    const inProgressCount = reports.filter((r) => r.status === "In Progress").length;

    if (statActiveEl) statActiveEl.textContent = String(activeCount);
    if (statPendingEl) statPendingEl.textContent = String(pendingCount);
    if (statProgressEl) statProgressEl.textContent = String(criticalCount);
    if (statResolvedEl) statResolvedEl.textContent = String(resolvedCount);

    // 2. Dynamic Map View Stats (Active non-resolved alerts)
    const activeAlerts = reports.filter(r => r.status !== "Resolved");
    const totalActive = activeAlerts.length;

    // Calculate how many active reports were submitted TODAY
    const today = new Date();
    const newTodayCount = activeAlerts.filter(r => {
      if (!r.createdAt) return false;
      return r.createdAt.getDate() === today.getDate() &&
        r.createdAt.getMonth() === today.getMonth() &&
        r.createdAt.getFullYear() === today.getFullYear();
    }).length;

    const activeValEl = document.getElementById("map-active-alerts-val");
    const newIndicatorEl = document.getElementById("map-active-new-indicator");

    if (activeValEl) activeValEl.textContent = String(totalActive);

    if (newIndicatorEl) {
      if (newTodayCount > 0) {
        newIndicatorEl.className = "text-[10px] font-bold text-emerald-600 mt-2 flex items-center gap-1";
        newIndicatorEl.innerHTML = `<span class="text-xs">↑</span> +${newTodayCount} new today`;
      } else {
        newIndicatorEl.className = "text-[10px] font-bold text-slate-400 mt-2 flex items-center gap-1";
        newIndicatorEl.innerHTML = `No new alerts today`;
      }
    }

    // Severity Breakdown
    const lowCount = activeAlerts.filter(r => r.severity <= 2).length;
    const mediumCount = activeAlerts.filter(r => r.severity === 3).length;
    const highCountMap = activeAlerts.filter(r => r.severity >= 4).length; // Both score 4 and 5 consolidated

    if (document.getElementById("map-severity-low-val")) document.getElementById("map-severity-low-val").textContent = String(lowCount);
    if (document.getElementById("map-severity-medium-val")) document.getElementById("map-severity-medium-val").textContent = String(mediumCount);
    if (document.getElementById("map-severity-high-val")) document.getElementById("map-severity-high-val").textContent = String(highCountMap);

    // Dynamic Map KPI Cards
    if (document.getElementById("map-kpi-total")) document.getElementById("map-kpi-total").textContent = String(reports.length);
    if (document.getElementById("map-kpi-pending")) document.getElementById("map-kpi-pending").textContent = String(pendingCount);
    if (document.getElementById("map-kpi-progress")) document.getElementById("map-kpi-progress").textContent = String(inProgressCount);
    if (document.getElementById("map-kpi-resolved")) document.getElementById("map-kpi-resolved").textContent = String(resolvedCount);
  }

  // --- MAP LOGIC ---
  function initLeafletMap() {
    if (!mapInstance && document.getElementById("lgu-map")) {
      mapInstance = L.map("lgu-map").setView([14.5995, 120.9842], 13);
      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        maxZoom: 19,
      }).addTo(mapInstance);
      markerLayerGroup = L.layerGroup().addTo(mapInstance);
    }

    if (!dashboardMapInstance && document.getElementById("lgu-dashboard-map")) {
      dashboardMapInstance = L.map("lgu-dashboard-map", { zoomControl: false }).setView([14.5995, 120.9842], 12);
      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        maxZoom: 19,
      }).addTo(dashboardMapInstance);
      dashboardLayerGroup = L.layerGroup().addTo(dashboardMapInstance);
    }

    syncMapGlobals();
  }

  function getReportLatLng(report) {
    const coords = report.coordinates;

    // Safely extract and convert string coordinates to actual floating-point numbers
    if (coords && coords.lat != null && coords.lng != null) {
      const parsedLat = parseFloat(coords.lat);
      const parsedLng = parseFloat(coords.lng);

      // Make sure the parsing actually resulted in valid numbers
      if (!isNaN(parsedLat) && !isNaN(parsedLng)) {
        return [parsedLat, parsedLng];
      }
    }

    if (Array.isArray(coords) && coords.length >= 2) {
      const parsedLat = parseFloat(coords[0]);
      const parsedLng = parseFloat(coords[1]);
      if (!isNaN(parsedLat) && !isNaN(parsedLng)) {
        return [parsedLat, parsedLng];
      }
    }

    // GPS Fallback to Manila center if everything else completely fails
    let hash = 0;
    for (let i = 0; i < report.id.length; i++) hash = report.id.charCodeAt(i) + ((hash << 5) - hash);
    const randomOffsetLat = (Math.abs(hash) % 100) / 15000;
    const randomOffsetLng = (Math.abs(hash >> 2) % 100) / 15000;
    return [14.5995 + randomOffsetLat, 120.9842 + randomOffsetLng];
  }

  function buildMarkerHtml(report) {
    let pinColorClass = "text-amber-500";
    let pulseHtml = "";

    // Evaluate Status First (Base Color)
    if (report.status === "Resolved") {
      pinColorClass = "text-slate-400";
    } else if (report.status === "In Progress") {
      pinColorClass = "text-blue-500";
      // If severe AND in progress -> Blue Pin, Blue Pulse
      if (report.severity >= 4) {
        pulseHtml = '<span class="absolute top-[10%] left-[20%] inline-flex h-[60%] w-[60%] rounded-full bg-blue-400 opacity-60 animate-ping"></span>';
      }
    } else {
      // Pending Verification
      if (report.severity >= 4) {
        // If severe AND pending -> Red Pin, Red Pulse
        pinColorClass = "text-rose-500";
        pulseHtml = '<span class="absolute top-[10%] left-[20%] inline-flex h-[60%] w-[60%] rounded-full bg-rose-400 opacity-60 animate-ping"></span>';
      } else {
        // If normal AND pending -> Amber Pin, no pulse
        pinColorClass = "text-amber-500";
      }
    }

    const svgIcon = `
      <svg class="relative z-10 w-full h-full drop-shadow-md ${pinColorClass}" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
      </svg>
    `;
    return '<div class="relative w-full h-full">' + pulseHtml + svgIcon + '</div>';
  }

  function getFilteredReportsForMap() {
    let list = [...reports];

    // 1. Status Filter
    if (activeMapStatusFilter !== "all") {
      list = list.filter(r => r.status === activeMapStatusFilter);
    }

    // 2. Category Filter
    if (activeMapCategoryFilter !== "all") {
      list = list.filter(r => r.category === activeMapCategoryFilter);
    }

    // 3. Severity Checkboxes
    list = list.filter(r => {
      if (r.severity >= 4) return showSeverityHigh;
      if (r.severity === 3) return showSeverityMedium;
      return showSeverityLow;
    });

    return list;
  }

  function updateHeatmap() {
    if (!mapInstance) return;
    if (heatLayer) {
      mapInstance.removeLayer(heatLayer);
      heatLayer = null;
    }

    if (showHeatmap) {
      const filteredForMap = getFilteredReportsForMap();
      const heatPoints = filteredForMap
        .map(r => {
          const latLng = getReportLatLng(r);
          return [latLng[0], latLng[1], r.severity / 5]; // lat, lng, intensity
        });

      if (typeof L.heatLayer === "function") {
        heatLayer = L.heatLayer(heatPoints, {
          radius: 35,
          blur: 20,
          max: 1.0
        }).addTo(mapInstance);
      } else {
        console.warn("Leaflet Heat plugin not loaded.");
      }
    }
  }

  function updateRecentCriticalAlerts() {
    const container = document.getElementById("recent-critical-alerts-container");
    if (!container) return;

    const criticalReports = reports
      .filter(r => r.severity >= 4 && r.status !== "Resolved")
      .sort((a, b) => {
        if (a.createdAt && b.createdAt) {
          return b.createdAt.getTime() - a.createdAt.getTime();
        }
        return b.docId.localeCompare(a.docId);
      });

    const top3 = criticalReports.slice(0, 3);
    container.innerHTML = "";

    if (top3.length === 0) {
      container.innerHTML = `<p class="text-xs text-slate-400 italic py-4 text-center">No active critical alerts.</p>`;
      return;
    }

    top3.forEach(report => {
      const card = document.createElement("div");
      card.className = "bg-white hover:bg-slate-50 border border-slate-200 p-3 rounded-xl shadow-sm transition-all flex items-start gap-3 cursor-pointer group mb-2.5";

      card.addEventListener("click", () => {
        openDetailModal(report.docId);
      });

      const timeStr = report.createdAt ? report.createdAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "N/A";
      const dateStr = report.createdAt ? report.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";

      card.innerHTML = `
        <div class="w-10 h-10 rounded-lg overflow-hidden border border-slate-100 flex-shrink-0">
          <img src="${report.imageUrl || PLACEHOLDER_IMAGE}" class="w-full h-full object-cover group-hover:scale-105 transition-transform" />
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex items-center justify-between gap-2">
            <h5 class="text-xs font-bold text-slate-800 truncate">${report.category}</h5>
            <span class="text-[9px] font-black uppercase text-rose-600 bg-rose-50 border border-rose-100/50 px-1.5 py-0.5 rounded">High</span>
          </div>
          <p class="text-[10px] text-slate-500 truncate mt-0.5">${report.location}</p>
          <p class="text-[9px] text-slate-400 font-medium mt-1">${dateStr} • ${timeStr}</p>
        </div>
      `;
      container.appendChild(card);
    });
  }

  function updateMapFilterVisuals(activeId) {
    const filterButtons = {
      all: document.getElementById("map-filter-all"),
      high: document.getElementById("map-filter-high"),
      medium: document.getElementById("map-filter-medium"),
      resolved: document.getElementById("map-filter-resolved")
    };

    Object.keys(filterButtons).forEach(key => {
      const btn = filterButtons[key];
      if (btn) {
        if (key === activeId) {
          btn.className = "px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 text-white shadow-sm transition-all cursor-pointer";
        } else {
          btn.className = "px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-50 text-slate-700 hover:bg-slate-100 transition-all cursor-pointer";
        }
      }
    });
  }

  function renderMapMarkers() {
    if (!markerLayerGroup && !dashboardLayerGroup) return;
    if (markerLayerGroup) markerLayerGroup.clearLayers();
    if (dashboardLayerGroup) dashboardLayerGroup.clearLayers();

    const mapReports = getFilteredReportsForMap();

    // Dynamically update the count of filtered alerts in the overlay card
    const activeValEl = document.getElementById("map-active-alerts-val");
    if (activeValEl) activeValEl.textContent = String(mapReports.length);

    // Render main map markers (filtered) only if showMarkers is true
    if (showMarkers) {
      mapReports.forEach((report) => {
        const latLng = getReportLatLng(report);
        const popupHtml = `
          <div class="text-sm space-y-2 p-1 min-w-[180px]">
            <p><strong>Report ID:</strong> ${report.id}</p>
            <p><strong>Severity:</strong> ${report.severity} / 5</p>
            <p><strong>Category:</strong> ${report.category}</p>
            <p><strong>Status:</strong> ${report.status}</p>
            <button type="button" onclick="window.openDetailModal('${report.docId}')" class="mt-2 w-full px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700">View Details</button>
          </div>
        `;

        if (markerLayerGroup) {
          const icon = L.divIcon({
            className: "bg-transparent border-0",
            html: buildMarkerHtml(report),
            iconSize: [32, 32],
            iconAnchor: [16, 32],
            popupAnchor: [0, -32],
          });
          const marker = L.marker(latLng, { icon });
          marker.bindPopup(popupHtml);
          markerLayerGroup.addLayer(marker);
        }
      });
    }

    // Render dashboard map markers (all reports)
    reports.forEach((report) => {
      const latLng = getReportLatLng(report);
      if (dashboardLayerGroup) {
        const dashboardIcon = L.divIcon({
          className: "bg-transparent border-0",
          html: buildMarkerHtml(report),
          iconSize: [32, 32],
          iconAnchor: [12, 24],
        });
        const dashboardMarker = L.marker(latLng, { icon: dashboardIcon, interactive: false });
        dashboardLayerGroup.addLayer(dashboardMarker);
      }
    });

    updateHeatmap();
  }

  // --- UI & NAVIGATION LOGIC ---
  function switchView(viewName) {
    const navButtons = [navDashboardBtn, navReportsBtn, navMapBtn, navAnalyticsBtn, navSettingsBtn];

    // 1. Reset all buttons to inactive state
    navButtons.forEach((btn) => {
      if (btn) {
        btn.classList.remove("bg-emerald-50", "text-emerald-700", "border-emerald-500", "font-bold");
        btn.classList.add("text-slate-500", "border-transparent", "font-semibold");
      }
    });

    // 2. Hide all panels
    viewDashboardPanel.classList.add("hidden");
    viewReportsPanel.classList.add("hidden");
    viewMapPanel.classList.add("hidden");

    // 3. Activate selected view and apply correct emerald highlights
    if (viewName === "dashboard") {
      if (mainHeader) mainHeader.classList.remove("hidden");
      viewDashboardPanel.classList.remove("hidden");
      if (navDashboardBtn) navDashboardBtn.classList.add("bg-emerald-50", "text-emerald-700", "border-emerald-500", "font-bold");
      if (viewTitle) viewTitle.textContent = "Dashboard";
      updateDashboardMetrics(reports);
      initLeafletMap();
      renderMapMarkers();
      refreshMapSizes(100);
    } else {
      if (mainHeader) mainHeader.classList.add("hidden");
      if (viewName === "reports") {
        viewReportsPanel.classList.remove("hidden");
        if (navReportsBtn) navReportsBtn.classList.add("bg-emerald-50", "text-emerald-700", "border-emerald-500", "font-bold");
        if (viewTitle) viewTitle.textContent = "Civic Reports Database";
        renderReportsTable();
      } else if (viewName === "map") {
        viewMapPanel.classList.remove("hidden");
        if (navMapBtn) navMapBtn.classList.add("bg-emerald-50", "text-emerald-700", "border-emerald-500", "font-bold");
        if (viewTitle) viewTitle.textContent = "Live Reports Map";
        initLeafletMap();
        if (typeof updateRecentCriticalAlerts === "function") updateRecentCriticalAlerts();
        renderMapMarkers();
        refreshMapSizes(100);
      }
    }
  }

  // Track active sub-filter tab and dropdown states globally
  let currentStatusFilter = "all";
  let currentCategoryFilter = "all";
  let currentSortOrder = "date-desc"; // Default sorting by newest submitted time

  function renderReportsTable() {
    if (!reportsTableBody) return;
    const queryText = reportSearchInput ? reportSearchInput.value.toLowerCase().trim() : "";

    // Update live sub-tab totals indicator elements
    const counts = {
      all: reports.length,
      pending: reports.filter(r => r.status === "Pending Verification").length,
      progress: reports.filter(r => r.status === "In Progress").length,
      resolved: reports.filter(r => r.status === "Resolved").length
    };

    if (document.getElementById("tab-count-all")) document.getElementById("tab-count-all").textContent = `(${counts.all})`;
    if (document.getElementById("tab-count-pending")) document.getElementById("tab-count-pending").textContent = `(${counts.pending})`;
    if (document.getElementById("tab-count-progress")) document.getElementById("tab-count-progress").textContent = `(${counts.progress})`;
    if (document.getElementById("tab-count-resolved")) document.getElementById("tab-count-resolved").textContent = `(${counts.resolved})`;

    // Filter list based on selected sub-tab
    let filteredList = [...reports];
    if (currentStatusFilter === "pending") {
      filteredList = filteredList.filter(r => r.status === "Pending Verification");
    } else if (currentStatusFilter === "progress") {
      filteredList = filteredList.filter(r => r.status === "In Progress");
    } else if (currentStatusFilter === "resolved") {
      filteredList = filteredList.filter(r => r.status === "Resolved");
    }

    // Apply secondary category filter from custom dropdown
    if (currentCategoryFilter && currentCategoryFilter !== "all") {
      filteredList = filteredList.filter(r => r.category === currentCategoryFilter);
    }

    // Apply text query filter
    if (queryText) {
      filteredList = filteredList.filter((item) =>
        item.id.toLowerCase().includes(queryText) ||
        item.category.toLowerCase().includes(queryText) ||
        item.location.toLowerCase().includes(queryText) ||
        item.submittedBy.toLowerCase().includes(queryText) ||
        item.status.toLowerCase().includes(queryText)
      );
    }

    // Sort processing based on "Reported At" (createdAt timestamp)
    filteredList.sort((a, b) => {
      // Fallback to 0 if time is missing, though Firebase provides the timestamp
      const timeA = a.createdAt ? a.createdAt.getTime() : 0;
      const timeB = b.createdAt ? b.createdAt.getTime() : 0;

      if (currentSortOrder === "date-desc") {
        // Newest submitted forms first
        return timeB - timeA || b.docId.localeCompare(a.docId);
      } else {
        // Oldest submitted forms first
        return timeA - timeB || a.docId.localeCompare(b.docId);
      }
    });

    // Save filtered and sorted list for CSV export
    lastFilteredReports = filteredList;

    // Pagination calculations
    const totalItems = filteredList.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
    if (currentPage > totalPages) {
      currentPage = 1;
    }
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
    const paginatedList = filteredList.slice(startIndex, endIndex);

    reportsTableBody.innerHTML = "";

    if (totalItems === 0) {
      reportsTableBody.innerHTML = `<tr><td colspan="7" class="px-6 py-12 text-center text-slate-500 font-medium bg-slate-50/50">No matching reports found.</td></tr>`;
      if (tableResultsCounter) tableResultsCounter.textContent = "Showing 0 reports";
      const pagContainer = document.getElementById("pagination-controls");
      if (pagContainer) pagContainer.innerHTML = "";
      return;
    }

    if (tableResultsCounter) {
      tableResultsCounter.textContent = `Showing ${startIndex + 1} to ${endIndex} of ${totalItems} reports`;
    }

    renderPaginationControls(totalPages);

    paginatedList.forEach((report) => {
      const tr = document.createElement("tr");
      tr.className = "hover:bg-slate-50/80 transition-colors border-b border-slate-100 align-middle";

      // 1. Calculate Status Badge Styles
      let badgeColorClass = "bg-slate-100 text-slate-700 border border-slate-200";
      if (report.status === "Resolved") {
        badgeColorClass = "bg-green-50 text-green-700 border border-green-200";
      } else if (report.status === "In Progress") {
        badgeColorClass = "bg-blue-50 text-blue-700 border border-blue-200";
      } else if (report.status === "Pending Verification") {
        badgeColorClass = "bg-amber-50 text-amber-700 border border-amber-200";
      }

      // 2. Calculate Priority Badge Styles
      let priorityText = "Low";
      let priorityClass = "bg-slate-100 text-slate-600 font-semibold text-xs px-2.5 py-0.5 rounded";

      if (report.severity >= 4) {
        priorityText = "High";
        priorityClass = "bg-rose-50 text-rose-700 font-bold text-xs px-2.5 py-0.5 rounded border border-rose-100";
      } else if (report.severity === 3) {
        priorityText = "Medium";
        priorityClass = "bg-amber-50 text-amber-700 font-semibold text-xs px-2.5 py-0.5 rounded border border-amber-100";
      }

      tr.innerHTML = `
        <td class="px-6 py-4 font-mono font-semibold text-slate-900">#${report.id}</td>
        <td class="px-6 py-4 font-semibold text-slate-800 capitalize">${report.category}</td>
        <td class="px-6 py-4 text-slate-600 max-w-xs truncate">${report.location}</td>
        <td class="px-6 py-4">
          <span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${badgeColorClass}">
            ${report.status}
          </span>
        </td>
        <td class="px-6 py-4">
          <span class="${priorityClass}">
            ${priorityText}
          </span>
        </td>
        <td class="px-6 py-4 text-slate-600 whitespace-nowrap">${formatReportedAt(report.createdAt)}</td>
        <td class="px-6 py-4 text-right">
          <button data-doc-id="${report.docId}" class="action-view-btn text-xs font-bold text-emerald-600 hover:text-emerald-800 transition-colors px-3 py-1.5 rounded bg-emerald-50 hover:bg-emerald-100 inline-flex items-center gap-1">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
            <span>View</span>
          </button>
        </td>
      `;
      reportsTableBody.appendChild(tr);
    });

    reportsTableBody.querySelectorAll(".action-view-btn").forEach((btn) => {
      btn.addEventListener("click", function () {
        openDetailModal(this.getAttribute("data-doc-id"));
      });
    });
  }

  function updateTabHighlight(activeKey) {
    const tabs = {
      all: document.getElementById("filter-tab-all"),
      pending: document.getElementById("filter-tab-pending"),
      progress: document.getElementById("filter-tab-progress"),
      resolved: document.getElementById("filter-tab-resolved")
    };
    Object.keys(tabs).forEach(key => {
      const t = tabs[key];
      if (t) {
        if (key === activeKey) {
          t.className = "px-4 py-2.5 border-b-2 border-emerald-600 text-emerald-600 font-bold transition-all";
        } else {
          t.className = "px-4 py-2.5 border-b-2 border-transparent hover:text-slate-800 transition-all";
        }
      }
    });
  }

  // Bind events for filter sub-tabs execution
  function setupTabFilters() {
    const tabs = {
      all: document.getElementById("filter-tab-all"),
      pending: document.getElementById("filter-tab-pending"),
      progress: document.getElementById("filter-tab-progress"),
      resolved: document.getElementById("filter-tab-resolved")
    };

    Object.keys(tabs).forEach(key => {
      if (!tabs[key]) return;
      tabs[key].addEventListener("click", function () {
        currentStatusFilter = key;
        updateTabHighlight(key);

        // Sync select dropdown
        const statusSelect = document.getElementById("status-filter-select");
        if (statusSelect) {
          const selectVals = {
            all: "all",
            pending: "Pending Verification",
            progress: "In Progress",
            resolved: "Resolved"
          };
          statusSelect.value = selectVals[key] || "all";
        }

        currentPage = 1;
        renderReportsTable();
      });
    });
  }

  // --- MODAL LOGIC ---
  function populateModal(report) {
    modalReportId.textContent = `Report #${report.id}`;
    modalCategory.textContent = report.category;
    modalLocation.textContent = report.location;
    modalSubmitter.textContent = report.submittedBy;
    if (modalContactInfo) modalContactInfo.textContent = report.contactInfo || "Not Provided";
    modalAiVolume.textContent = report.aiVolume || "N/A";
    modalSeverityScore.textContent = String(report.severity || 0);
    modalNotes.textContent = report.notes ? `"${report.notes}"` : '"No additional comments provided."';
    modalStatusSelect.value = report.status;
    updateModalStatusBadge(report.status);
    modalReportImage.src = report.imageUrl || PLACEHOLDER_IMAGE;
  }

  function openDetailModal(docId) {
    selectedReport = reports.find((r) => r.docId === docId);
    if (!selectedReport) return;
    populateModal(selectedReport);
    reportDetailModal.classList.remove("hidden");
    document.body.classList.add("overflow-hidden");
  }

  function updateModalStatusBadge(status) {
    modalStatusBadge.className = "inline-flex items-center gap-2 mt-1 px-3 py-1 rounded-full text-xs font-semibold";
    let dotEl = modalStatusBadge.querySelector("span:first-child");
    let textEl = modalStatusBadge.querySelector("span:last-child");

    if (!dotEl) {
      modalStatusBadge.innerHTML = '<span class="w-2 h-2 rounded-full"></span><span></span>';
      dotEl = modalStatusBadge.querySelector("span:first-child");
      textEl = modalStatusBadge.querySelector("span:last-child");
    }

    textEl.textContent = status;
    if (status === "Resolved") {
      modalStatusBadge.classList.add("bg-green-50", "text-green-700", "border", "border-green-200");
      dotEl.className = "w-2 h-2 rounded-full bg-green-500";
    } else if (status === "In Progress") {
      modalStatusBadge.classList.add("bg-amber-50", "text-amber-700", "border", "border-amber-200");
      dotEl.className = "w-2 h-2 rounded-full bg-amber-500";
    } else {
      modalStatusBadge.classList.add("bg-slate-100", "text-slate-700", "border", "border-slate-200");
      dotEl.className = "w-2 h-2 rounded-full bg-slate-400";
    }
  }

  function closeModal() {
    reportDetailModal.classList.add("hidden");
    document.body.classList.remove("overflow-hidden");
    selectedReport = null;
  }

  async function saveStatusChange() {
    if (!selectedReport) return;
    const newStatus = modalStatusSelect.value;
    const firestoreStatus = STATUS_TO_FIRESTORE[newStatus] || "pending";
    try {
      modalBtnSave.disabled = true;
      modalBtnSave.textContent = "Saving...";
      await updateDoc(doc(db, "reports", selectedReport.docId), { status: firestoreStatus });
      closeModal();
    } catch (error) {
      console.error("Failed to save report status change:", error);
      alert("Could not save status change.\n\n" + error.message);
    } finally {
      modalBtnSave.disabled = false;
      modalBtnSave.textContent = "Save Status Changes";
    }
  }

  function setupSidebarToggle() {
    const sidebar = document.getElementById("main-sidebar");
    const mainWrapper = document.getElementById("main-content-wrapper");
    const toggleBtn = document.getElementById("toggle-sidebar-btn");
    const toggleIcon = document.getElementById("toggle-icon");
    const sidebarTexts = document.querySelectorAll(".sidebar-text");

    if (!toggleBtn || !sidebar || !mainWrapper) return;

    toggleBtn.addEventListener("click", () => {
      sidebar.classList.toggle("w-64");
      sidebar.classList.toggle("w-16");
      mainWrapper.classList.toggle("pl-64");
      mainWrapper.classList.toggle("pl-16");

      const collapsed = sidebar.classList.contains("w-16");
      if (toggleIcon) {
        toggleIcon.innerHTML = collapsed
          ? '<path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />'
          : '<path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />';
      }
      sidebarTexts.forEach((el) => {
        if (collapsed) {
          el.classList.add("opacity-0", "hidden");
        } else {
          el.classList.remove("hidden");
          setTimeout(() => el.classList.remove("opacity-0"), 50);
        }
      });

      setTimeout(() => {
        if (window.mapInstance) window.mapInstance.invalidateSize();
        if (window.dashboardMapInstance) window.dashboardMapInstance.invalidateSize();
      }, 350);
    });
  }

  // --- EVENT LISTENERS & SETUP ---
  function setupEventListeners() {
    // Navigation Routing
    if (navDashboardBtn) navDashboardBtn.addEventListener("click", () => switchView("dashboard"));
    if (navReportsBtn) navReportsBtn.addEventListener("click", () => switchView("reports"));
    if (navMapBtn) navMapBtn.addEventListener("click", () => switchView("map"));

    const comingSoonButtons = [
      navAnalyticsBtn,
      document.getElementById("nav-tasks"),
      document.getElementById("nav-routes"),
      document.getElementById("nav-insights"),
      navSettingsBtn,
    ];

    comingSoonButtons.forEach((nav) => {
      if (nav) {
        nav.addEventListener("click", function () {
          const featureName = this.querySelector("span")
            ? this.querySelector("span").textContent.trim()
            : "This feature";
          showToast(featureName);
        });
      }
    });

    setupSidebarToggle();

    // Modal & Table Setup
    window.openDetailModal = openDetailModal;
    window.saveStatusChange = saveStatusChange;

    if (reportSearchInput) {
      reportSearchInput.addEventListener("input", () => {
        currentPage = 1;
        renderReportsTable();
      });
    }
    if (sortSelect) {
      sortSelect.addEventListener("change", () => {
        currentPage = 1;
        renderReportsTable();
      });
    }
    if (closeModalBtn) closeModalBtn.addEventListener("click", closeModal);
    if (modalBtnCloseSecondary) modalBtnCloseSecondary.addEventListener("click", closeModal);
    if (modalBtnSave) modalBtnSave.addEventListener("click", saveStatusChange);
    if (modalStatusSelect) modalStatusSelect.addEventListener("change", function () { updateModalStatusBadge(this.value); });

    const backdrop = document.getElementById("modal-backdrop");
    if (backdrop) backdrop.addEventListener("click", closeModal);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" || e.key === "Esc") closeModal(); });

    // --- Toolbar Filters Setup (Reports Tab Custom Dropdowns) ---

    // Status Dropdown
    const rptStatusBtn = document.getElementById("reports-dropdown-status-btn");
    const rptStatusMenu = document.getElementById("reports-dropdown-status-menu");
    const rptStatusText = document.getElementById("reports-dropdown-status-text");

    if (rptStatusBtn && rptStatusMenu) {
      rptStatusBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        rptStatusMenu.classList.toggle("hidden");
        document.getElementById("reports-dropdown-category-menu")?.classList.add("hidden");
        document.getElementById("reports-dropdown-sort-menu")?.classList.add("hidden");
      });

      rptStatusMenu.querySelectorAll("div[data-value]").forEach(opt => {
        opt.addEventListener("click", (e) => {
          e.stopPropagation();
          const val = e.target.dataset.value;
          const keys = { "all": "all", "Pending Verification": "pending", "In Progress": "progress", "Resolved": "resolved" };

          currentStatusFilter = keys[val] || "all";
          if (rptStatusText) rptStatusText.textContent = e.target.textContent;
          rptStatusMenu.classList.add("hidden");
          updateTabHighlight(currentStatusFilter);
          currentPage = 1;
          renderReportsTable();
        });
      });
    }

    // Category Dropdown
    const rptCatBtn = document.getElementById("reports-dropdown-category-btn");
    const rptCatMenu = document.getElementById("reports-dropdown-category-menu");
    if (rptCatBtn && rptCatMenu) {
      rptCatBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        rptCatMenu.classList.toggle("hidden");
        document.getElementById("reports-dropdown-status-menu")?.classList.add("hidden");
        document.getElementById("reports-dropdown-sort-menu")?.classList.add("hidden");
      });
    }

    // Sort Dropdown
    const rptSortBtn = document.getElementById("reports-dropdown-sort-btn");
    const rptSortMenu = document.getElementById("reports-dropdown-sort-menu");
    const rptSortText = document.getElementById("reports-dropdown-sort-text");

    if (rptSortBtn && rptSortMenu) {
      rptSortBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        rptSortMenu.classList.toggle("hidden");
        document.getElementById("reports-dropdown-category-menu")?.classList.add("hidden");
        document.getElementById("reports-dropdown-status-menu")?.classList.add("hidden");
      });

      rptSortMenu.querySelectorAll("div[data-value]").forEach(opt => {
        opt.addEventListener("click", (e) => {
          e.stopPropagation();
          currentSortOrder = e.target.dataset.value;
          if (rptSortText) rptSortText.textContent = e.target.textContent;
          rptSortMenu.classList.add("hidden");
          currentPage = 1;
          renderReportsTable();
        });
      });
    }

    // Barangay Dropdown (Coming Soon)
    const rptBrgyBtn = document.getElementById("reports-dropdown-barangay-btn");
    if (rptBrgyBtn) {
      rptBrgyBtn.addEventListener("click", () => showToast("Barangay Mapping"));
    }

    // Filter Reset Button
    const filterBtn = document.getElementById("filter-btn");
    if (filterBtn) {
      filterBtn.addEventListener("click", function () {
        if (reportSearchInput) reportSearchInput.value = "";

        currentStatusFilter = "all";
        currentCategoryFilter = "all";
        currentSortOrder = "date-desc";

        if (rptStatusText) rptStatusText.textContent = "All Status";
        if (document.getElementById("reports-dropdown-category-text")) document.getElementById("reports-dropdown-category-text").textContent = "All Categories";
        if (rptSortText) rptSortText.textContent = "Reported At (Newest)";

        updateTabHighlight("all");
        currentPage = 1;
        renderReportsTable();
      });
    }

    const exportBtn = document.getElementById("export-btn");
    if (exportBtn) {
      exportBtn.addEventListener("click", exportToCSV);
    }

    // Map overlay filter listeners
    const mapFilterStatus = document.getElementById("map-filter-status");
    if (mapFilterStatus) {
      mapFilterStatus.addEventListener("change", function () {
        activeMapStatusFilter = this.value;
        renderMapMarkers();
      });
    }

    const mapFilterCategory = document.getElementById("map-filter-category");
    if (mapFilterCategory) {
      mapFilterCategory.addEventListener("change", function () {
        activeMapCategoryFilter = this.value;
        renderMapMarkers();
      });
    }

    const mapSevLow = document.getElementById("map-severity-low");
    if (mapSevLow) {
      mapSevLow.addEventListener("change", function () {
        showSeverityLow = this.checked;
        renderMapMarkers();
      });
    }

    const mapSevMedium = document.getElementById("map-severity-medium");
    if (mapSevMedium) {
      mapSevMedium.addEventListener("change", function () {
        showSeverityMedium = this.checked;
        renderMapMarkers();
      });
    }

    const mapSevHigh = document.getElementById("map-severity-high");
    if (mapSevHigh) {
      mapSevHigh.addEventListener("change", function () {
        showSeverityHigh = this.checked;
        renderMapMarkers();
      });
    }

    // Map filters reset listener
    const mapBtnFilters = document.getElementById("map-btn-filters");
    if (mapBtnFilters) {
      mapBtnFilters.addEventListener("click", function () {
        activeMapStatusFilter = "all";
        activeMapCategoryFilter = "all";
        const statusText = document.getElementById("dropdown-status-text");
        const catText = document.getElementById("dropdown-category-text");
        if (statusText) statusText.textContent = "Filter Reports (All)";
        if (catText) catText.textContent = "All Categories";

        const lowCb = document.getElementById("map-severity-low");
        const medCb = document.getElementById("map-severity-medium");
        const highCb = document.getElementById("map-severity-high");
        if (lowCb) lowCb.checked = true;
        if (medCb) medCb.checked = true;
        if (highCb) highCb.checked = true;

        showSeverityLow = true;
        showSeverityMedium = true;
        showSeverityHigh = true;

        renderMapMarkers();
        showToast("Map filters have been successfully reset.");
      });
    }
    // --- Custom Map Dropdown Toggle Logic ---
    const statusBtn = document.getElementById("dropdown-status-btn");
    const statusMenu = document.getElementById("dropdown-status-menu");
    const statusText = document.getElementById("dropdown-status-text");

    if (statusBtn && statusMenu) {
      statusBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        statusMenu.classList.toggle("hidden");
        document.getElementById("dropdown-category-menu")?.classList.add("hidden");
      });

      statusMenu.querySelectorAll("div[data-value]").forEach(opt => {
        opt.addEventListener("click", (e) => {
          e.stopPropagation();
          activeMapStatusFilter = e.target.dataset.value;
          if (statusText) statusText.textContent = e.target.textContent;
          statusMenu.classList.add("hidden");
          renderMapMarkers();
        });
      });
    }

    const catBtn = document.getElementById("dropdown-category-btn");
    const catMenu = document.getElementById("dropdown-category-menu");
    if (catBtn && catMenu) {
      catBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        catMenu.classList.toggle("hidden");
        document.getElementById("dropdown-status-menu")?.classList.add("hidden");
      });
    }

    // Global Click Listener to close all open dropdowns
    document.addEventListener("click", () => {
      [
        "reports-dropdown-status-menu",
        "reports-dropdown-category-menu",
        "reports-dropdown-sort-menu",
        "dropdown-status-menu",
        "dropdown-category-menu"
      ].forEach(id => {
        const menu = document.getElementById(id);
        if (menu && !menu.classList.contains("hidden")) menu.classList.add("hidden");
      });
    });

    // Map overlay layer listeners
    const layerToggleHeatmap = document.getElementById("layer-toggle-heatmap");
    if (layerToggleHeatmap) {
      layerToggleHeatmap.addEventListener("change", function () {
        if (this.checked) {
          showToast("Heatmap density layer is a work in progress.");
          this.checked = false;
          showHeatmap = false;
        }
      });
    }

    const layerToggleMarkers = document.getElementById("layer-toggle-markers");
    if (layerToggleMarkers) {
      layerToggleMarkers.addEventListener("change", function () {
        showMarkers = this.checked;
        renderMapMarkers();
      });
    }

    const layerToggleBarangay = document.getElementById("layer-toggle-barangay");
    if (layerToggleBarangay) {
      layerToggleBarangay.addEventListener("change", function () {
        if (this.checked) {
          showToast("Barangay Boundaries");
          this.checked = false;
        }
      });
    }

    const layerToggleFlood = document.getElementById("layer-toggle-flood");
    if (layerToggleFlood) {
      layerToggleFlood.addEventListener("change", function () {
        if (this.checked) {
          showToast("Flood Prone Zones");
          this.checked = false;
        }
      });
    }

    const mapBtnViewAll = document.getElementById("map-btn-view-all");
    if (mapBtnViewAll) {
      mapBtnViewAll.addEventListener("click", () => {
        switchView("reports");
      });
    }

    // Initialize Sub-Tab Filters
    setupTabFilters();
  }

  // Final Execution Hook
  document.addEventListener("DOMContentLoaded", init);

})();