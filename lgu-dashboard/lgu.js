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
      category: data.wasteType || "Uncategorized",      
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
  let selectedReport = null;
  let unsubscribeReports = null;
  
  // Map Variables
  let mapInstance = null;
  let markerLayerGroup = null;
  let dashboardMapInstance = null;
  let dashboardLayerGroup = null;

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
        updateDashboardMetrics(reports);
        renderReportsTable();
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

  function updateDashboardMetrics(reports) {
    const activeCount = reports.length;
    const pendingCount = reports.filter((r) => r.status === "Pending Verification").length;
    const inProgressCount = reports.filter((r) => r.status === "In Progress").length;
    const resolvedCount = reports.filter((r) => r.status === "Resolved").length;

    if (statActiveEl) statActiveEl.textContent = String(activeCount);
    if (statPendingEl) statPendingEl.textContent = String(pendingCount);
    if (statProgressEl) statProgressEl.textContent = String(inProgressCount);
    if (statResolvedEl) statResolvedEl.textContent = String(resolvedCount);
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

  function renderMapMarkers() {
    if (!markerLayerGroup && !dashboardLayerGroup) return;
    if (markerLayerGroup) markerLayerGroup.clearLayers();
    if (dashboardLayerGroup) dashboardLayerGroup.clearLayers();

    reports.forEach((report) => {
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
    viewDashboardPanel.classList.remove("hidden");
    if (navDashboardBtn) navDashboardBtn.classList.add("bg-emerald-50", "text-emerald-700", "border-emerald-500", "font-bold");
    if (viewTitle) viewTitle.textContent = "Dashboard";
    updateDashboardMetrics(reports);
    initLeafletMap();
    renderMapMarkers();
    refreshMapSizes(100);
  } else if (viewName === "reports") {
    viewReportsPanel.classList.remove("hidden");
    if (navReportsBtn) navReportsBtn.classList.add("bg-emerald-50", "text-emerald-700", "border-emerald-500", "font-bold");
    if (viewTitle) viewTitle.textContent = "Civic Reports Database";
    renderReportsTable();
  } else if (viewName === "map") {
    viewMapPanel.classList.remove("hidden");
    if (navMapBtn) navMapBtn.classList.add("bg-emerald-50", "text-emerald-700", "border-emerald-500", "font-bold");
    if (viewTitle) viewTitle.textContent = "Live Reports Map";
    initLeafletMap();
    renderMapMarkers();
    refreshMapSizes(100);
  }
}

 // Track active sub-filter tab selection state
 let currentStatusFilter = "all";

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

   // Apply secondary text query filter
   if (queryText) {
     filteredList = filteredList.filter((item) =>
         item.id.toLowerCase().includes(queryText) ||
         item.category.toLowerCase().includes(queryText) ||
         item.location.toLowerCase().includes(queryText) ||
         item.submittedBy.toLowerCase().includes(queryText) ||
         item.status.toLowerCase().includes(queryText)
     );
   }

   // Sort processing
   const sortVal = sortSelect ? sortSelect.value : "id-desc";
   filteredList.sort((a, b) => {
     if (sortVal === "id-asc") return a.docId.localeCompare(b.docId);
     if (sortVal === "id-desc") return b.docId.localeCompare(a.docId);
     return 0;
   });

   reportsTableBody.innerHTML = "";

   if (filteredList.length === 0) {
     reportsTableBody.innerHTML = `<tr><td colspan="6" class="px-6 py-12 text-center text-slate-500 font-medium bg-slate-50/50">No matching reports found.</td></tr>`;
     if (tableResultsCounter) tableResultsCounter.textContent = "Showing 0 reports";
     return;
   }

   if (tableResultsCounter) tableResultsCounter.textContent = `Showing ${filteredList.length} of ${reports.length} reports`;

   filteredList.forEach((report) => {
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

     // 2. Calculate Priority Badge Styles (Map severity directly to layout priority)
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
     tabs[key].addEventListener("click", function() {
       // Reset styles
       Object.values(tabs).forEach(t => {
         if(t) t.className = "px-4 py-2.5 border-b-2 border-transparent hover:text-slate-800 transition-all";
       });
       // Highlight active tab
       this.className = "px-4 py-2.5 border-b-2 border-emerald-600 text-emerald-600 font-bold transition-all";
       currentStatusFilter = key;
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

    if (reportSearchInput) reportSearchInput.addEventListener("input", renderReportsTable);
    if (sortSelect) sortSelect.addEventListener("change", renderReportsTable);
    if (closeModalBtn) closeModalBtn.addEventListener("click", closeModal);
    if (modalBtnCloseSecondary) modalBtnCloseSecondary.addEventListener("click", closeModal);
    if (modalBtnSave) modalBtnSave.addEventListener("click", saveStatusChange);
    if (modalStatusSelect) modalStatusSelect.addEventListener("change", function () { updateModalStatusBadge(this.value); });

    const backdrop = document.getElementById("modal-backdrop");
    if (backdrop) backdrop.addEventListener("click", closeModal);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" || e.key === "Esc") closeModal(); });
  
  // Initialize Sub-Tab Filters
  setupTabFilters();
  }

  // Final Execution Hook
  document.addEventListener("DOMContentLoaded", init);

})();