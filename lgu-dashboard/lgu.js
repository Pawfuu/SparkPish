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

  function mapDocToReport(docSnap) {
    const data = docSnap.data();
    return {
      docId: docSnap.id,
      reportId: docSnap.id,
      id: docSnap.id.slice(0, 8).toUpperCase(),
      category: data.wasteType || "Uncategorized",
      location: data.location || "Unknown location",
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
  let mapInstance = null;
  let markerLayerGroup = null;
  let dashboardMapInstance = null;
  let dashboardLayerGroup = null;

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

  function subscribeToReports() {
    const reportsQuery = query(
      collection(db, "reports"),
      orderBy("createdAt", "desc")
    );

    unsubscribeReports = onSnapshot(
      reportsQuery,
      (snapshot) => {
        reports = snapshot.docs.map(mapDocToReport);
        console.log("Firestore snapshot reports:", reports);
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
        alert(
          "Could not load reports from Firestore. Check firebase-config.js and security rules.\n\n" +
            error.message
        );
      }
    );
  }

  function init() {
    setupEventListeners();
    updateDateDisplay();
    initLeafletMap();
    setTimeout(function () {
      if (dashboardMapInstance) dashboardMapInstance.invalidateSize();
    }, 100);
    subscribeToReports();

    window.addEventListener("beforeunload", () => {
      if (unsubscribeReports) unsubscribeReports();
    });
  }

  function updateDateDisplay() {
    const options = {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    };
    const dateEl = document.getElementById("header-date");
    if (dateEl) {
      dateEl.textContent = new Date().toLocaleDateString("en-US", options);
    }
  }

  function updateDashboardMetrics(reports) {
    const activeCount = reports.length;
    const pendingCount = reports.filter(
      (r) => r.status === "Pending Verification"
    ).length;
    const inProgressCount = reports.filter(
      (r) => r.status === "In Progress"
    ).length;
    const resolvedCount = reports.filter((r) => r.status === "Resolved").length;

    if (statActiveEl) statActiveEl.textContent = String(activeCount);
    if (statPendingEl) statPendingEl.textContent = String(pendingCount);
    if (statProgressEl) statProgressEl.textContent = String(inProgressCount);
    if (statResolvedEl) statResolvedEl.textContent = String(resolvedCount);
  }

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
      dashboardMapInstance = L.map("lgu-dashboard-map", { zoomControl: false }).setView(
        [14.5995, 120.9842],
        12
      );

      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        maxZoom: 19,
      }).addTo(dashboardMapInstance);

      dashboardLayerGroup = L.layerGroup().addTo(dashboardMapInstance);
    }
  }

  function getReportLatLng(report) {
    const coords = report.coordinates;
    if (coords && typeof coords.lat === "number" && typeof coords.lng === "number") {
      return [coords.lat, coords.lng];
    }
    if (Array.isArray(coords) && coords.length >= 2) {
      return [coords[0], coords[1]];
    }
    // HACKATHON FALLBACK: Generate consistent pin near Manila if GPS denied
    let hash = 0;
    for (let i = 0; i < report.id.length; i++) {
      hash = report.id.charCodeAt(i) + ((hash << 5) - hash);
    }
    const randomOffsetLat = (Math.abs(hash) % 100) / 15000;
    const randomOffsetLng = (Math.abs(hash >> 2) % 100) / 15000;
    return [14.5995 + randomOffsetLat, 120.9842 + randomOffsetLng];
  }

  function buildMarkerHtml(report) {
    let pinColorClass = "text-blue-500";
    let pulseHtml = "";

    if (report.status === "Resolved") {
      pinColorClass = "text-slate-400";
    } else if (report.severity >= 4) {
      pinColorClass = "text-red-600";
      // Pulse centered specifically on the top bulb of the teardrop pin
      pulseHtml = '<span class="absolute top-[10%] left-[20%] inline-flex h-[60%] w-[60%] rounded-full bg-red-400 opacity-60 animate-ping"></span>';
    } else if (report.severity >= 2) {
      pinColorClass = "text-amber-500";
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

      const popupHtml =
        '<div class="text-sm space-y-2 p-1 min-w-[180px]">' +
        "<p><strong>Report ID:</strong> " +
        report.id +
        "</p>" +
        "<p><strong>Severity:</strong> " +
        report.severity +
        " / 5</p>" +
        "<p><strong>Category:</strong> " +
        report.category +
        "</p>" +
        "<p><strong>Status:</strong> " +
        report.status +
        "</p>" +
        '<button type="button" onclick="window.openDetailModal(\'' +
        report.docId +
        "')" +
        ' class="mt-2 w-full px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700">' +
        "View Details</button>" +
        "</div>";

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

        const dashboardMarker = L.marker(latLng, {
          icon: dashboardIcon,
          interactive: false,
        });
        dashboardLayerGroup.addLayer(dashboardMarker);
      }
    });
  }

  function switchView(viewName) {
    const navButtons = [
      navDashboardBtn,
      navReportsBtn,
      navMapBtn,
      navAnalyticsBtn,
      navSettingsBtn,
    ];

    navButtons.forEach((btn) => {
      if (btn) {
        btn.classList.remove("bg-blue-50", "text-blue-700", "font-semibold");
        btn.classList.add(
          "text-slate-600",
          "hover:bg-slate-50",
          "hover:text-slate-900",
          "font-medium"
        );
      }
    });

    viewDashboardPanel.classList.add("hidden");
    viewReportsPanel.classList.add("hidden");
    viewMapPanel.classList.add("hidden");

    if (viewName === "dashboard") {
      viewDashboardPanel.classList.remove("hidden");
      if (navDashboardBtn) {
        navDashboardBtn.classList.add("bg-blue-50", "text-blue-700", "font-semibold");
        navDashboardBtn.classList.remove(
          "text-slate-600",
          "hover:bg-slate-50",
          "hover:text-slate-900",
          "font-medium"
        );
      }
      if (viewTitle) viewTitle.textContent = "Dashboard";
      updateDashboardMetrics(reports);
      initLeafletMap();
      if (typeof renderMapMarkers === "function") renderMapMarkers();
      setTimeout(function () {
        if (dashboardMapInstance) dashboardMapInstance.invalidateSize();
      }, 100);
    } else if (viewName === "reports") {
      viewReportsPanel.classList.remove("hidden");
      if (navReportsBtn) {
        navReportsBtn.classList.add("bg-blue-50", "text-blue-700", "font-semibold");
        navReportsBtn.classList.remove(
          "text-slate-600",
          "hover:bg-slate-50",
          "hover:text-slate-900",
          "font-medium"
        );
      }
      if (viewTitle) viewTitle.textContent = "Civic Reports Database";
      renderReportsTable();
    } else if (viewName === "map") {
      viewMapPanel.classList.remove("hidden");
      if (navMapBtn) {
        navMapBtn.classList.add("bg-blue-50", "text-blue-700", "font-semibold");
        navMapBtn.classList.remove(
          "text-slate-600",
          "hover:bg-slate-50",
          "hover:text-slate-900",
          "font-medium"
        );
      }
      if (viewTitle) viewTitle.textContent = "Live Reports Map";
      initLeafletMap();
      renderMapMarkers();
      setTimeout(function () {
        if (mapInstance) mapInstance.invalidateSize();
      }, 100);
    }
  }

  function renderReportsTable() {
    if (!reportsTableBody) return;

    const queryText = reportSearchInput
      ? reportSearchInput.value.toLowerCase().trim()
      : "";
    let sortedList = [...reports];

    if (queryText) {
      sortedList = sortedList.filter(
        (item) =>
          item.id.toLowerCase().includes(queryText) ||
          item.docId.toLowerCase().includes(queryText) ||
          item.category.toLowerCase().includes(queryText) ||
          item.location.toLowerCase().includes(queryText) ||
          item.submittedBy.toLowerCase().includes(queryText) ||
          item.status.toLowerCase().includes(queryText)
      );
    }

    const sortVal = sortSelect ? sortSelect.value : "id-desc";
    sortedList.sort((a, b) => {
      if (sortVal === "id-asc") return a.docId.localeCompare(b.docId);
      if (sortVal === "id-desc") return b.docId.localeCompare(a.docId);
      if (sortVal === "status-asc") return a.status.localeCompare(b.status);
      if (sortVal === "status-desc") return b.status.localeCompare(a.status);
      return 0;
    });

    reportsTableBody.innerHTML = "";

    if (sortedList.length === 0) {
      reportsTableBody.innerHTML = `
        <tr>
          <td colspan="6" class="px-6 py-12 text-center text-slate-500 font-medium bg-slate-50/50">
            No matching reports found in database.
          </td>
        </tr>
      `;
      if (tableResultsCounter) {
        tableResultsCounter.textContent = "Showing 0 reports";
      }
      return;
    }

    if (tableResultsCounter) {
      tableResultsCounter.textContent = `Showing ${sortedList.length} of ${reports.length} reports`;
    }

    sortedList.forEach((report) => {
      const tr = document.createElement("tr");
      tr.className =
        "hover:bg-slate-50/80 transition-colors border-b border-slate-100 align-middle";

      let badgeColorClass = "bg-slate-400 text-slate-700";
      let dotColorClass = "bg-slate-400";
      if (report.status === "Resolved") {
        badgeColorClass = "bg-green-50 text-green-700 border border-green-200";
        dotColorClass = "bg-green-500";
      } else if (report.status === "In Progress") {
        badgeColorClass = "bg-amber-50 text-amber-700 border border-amber-200";
        dotColorClass = "bg-amber-500";
      } else if (report.status === "Pending Verification") {
        badgeColorClass = "bg-slate-100 text-slate-700 border border-slate-200";
        dotColorClass = "bg-slate-500";
      }

      tr.innerHTML = `
        <td class="px-6 py-4 font-mono font-semibold text-slate-900">${report.id}</td>
        <td class="px-6 py-4 font-semibold text-slate-800">${report.category}</td>
        <td class="px-6 py-4 text-slate-600 max-w-xs truncate">${report.location}</td>
        <td class="px-6 py-4 text-slate-700">${report.submittedBy}</td>
        <td class="px-6 py-4">
          <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${badgeColorClass}">
            <span class="w-1.5 h-1.5 rounded-full ${dotColorClass}"></span>
            ${report.status}
          </span>
        </td>
        <td class="px-6 py-4 text-right">
          <button
            data-doc-id="${report.docId}"
            class="action-view-btn text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors px-3 py-1.5 rounded bg-blue-50 hover:bg-blue-100 inline-flex items-center gap-1"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
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

  function populateModal(report) {
    modalReportId.textContent = `Report #${report.id}`;
    modalCategory.textContent = report.category;
    modalLocation.textContent = report.location;
    modalSubmitter.textContent = report.submittedBy;
    if (modalContactInfo) modalContactInfo.textContent = report.contactInfo || "Not Provided";
    modalAiVolume.textContent = report.aiVolume || "N/A";
    modalSeverityScore.textContent = String(report.severity || 0);
    modalNotes.textContent = report.notes
      ? `"${report.notes}"`
      : '"No additional comments provided."';
    modalStatusSelect.value = report.status;
    updateModalStatusBadge(report.status);
    modalReportImage.src = report.imageUrl || PLACEHOLDER_IMAGE;
    modalReportImage.alt = report.imageUrl
      ? "Submitted garbage report photo"
      : "No photo available";
  }

  function openDetailModal(docId) {
    selectedReport = reports.find((r) => r.docId === docId);
    if (!selectedReport) return;

    populateModal(selectedReport);
    reportDetailModal.classList.remove("hidden");
    document.body.classList.add("overflow-hidden");
  }

  function updateModalStatusBadge(status) {
    modalStatusBadge.className =
      "inline-flex items-center gap-2 mt-1 px-3 py-1 rounded-full text-xs font-semibold";
    let dotEl = modalStatusBadge.querySelector("span:first-child");
    let textEl = modalStatusBadge.querySelector("span:last-child");

    if (!dotEl) {
      modalStatusBadge.innerHTML =
        '<span class="w-2 h-2 rounded-full"></span><span></span>';
      dotEl = modalStatusBadge.querySelector("span:first-child");
      textEl = modalStatusBadge.querySelector("span:last-child");
    }

    textEl.textContent = status;

    if (status === "Resolved") {
      modalStatusBadge.classList.add(
        "bg-green-50",
        "text-green-700",
        "border",
        "border-green-200"
      );
      dotEl.className = "w-2 h-2 rounded-full bg-green-500";
    } else if (status === "In Progress") {
      modalStatusBadge.classList.add(
        "bg-amber-50",
        "text-amber-700",
        "border",
        "border-amber-200"
      );
      dotEl.className = "w-2 h-2 rounded-full bg-amber-500";
    } else {
      modalStatusBadge.classList.add(
        "bg-slate-100",
        "text-slate-700",
        "border",
        "border-slate-200"
      );
      dotEl.className = "w-2 h-2 rounded-full bg-slate-400";
    }
  }

  function closeModal() {
    reportDetailModal.classList.add("hidden");
    document.body.classList.remove("overflow-hidden");
    selectedReport = null;
  }

  async function updateReportStatus(reportId, newStatus) {
    try {
      await updateDoc(doc(db, "reports", reportId), {
        status: newStatus,
      });
      console.log(`Report ${reportId} status updated to ${newStatus}`);
      return true;
    } catch (error) {
      console.error(`Failed to update status for report ${reportId}:`, error);
      return false;
    }
  }

  async function saveStatusChange() {
    console.log("Save button clicked!", {
      selectedReportId: selectedReport?.docId,
      selectedReportLabel: selectedReport?.id,
      selectedStatus: modalStatusSelect?.value,
    });

    if (!selectedReport) return;

    const newStatus = modalStatusSelect.value;
    const firestoreStatus = STATUS_TO_FIRESTORE[newStatus] || "pending";

    try {
      modalBtnSave.disabled = true;
      modalBtnSave.textContent = "Saving...";

      const success = await updateReportStatus(selectedReport.docId, firestoreStatus);
      if (!success) throw new Error("Firestore update failed");

      closeModal();
    } catch (error) {
      console.error("Failed to save report status change:", error);
      alert("Could not save status change.\n\n" + error.message);
    } finally {
      modalBtnSave.disabled = false;
      modalBtnSave.textContent = "Save Status Changes";
    }
  }

  function setupEventListeners() {
    if (navDashboardBtn) {
      navDashboardBtn.addEventListener("click", () => switchView("dashboard"));
    }
    if (navReportsBtn) {
      navReportsBtn.addEventListener("click", () => switchView("reports"));
    }

    if (navMapBtn) {
      navMapBtn.addEventListener("click", () => switchView("map"));
    }

    [navAnalyticsBtn, navSettingsBtn].forEach((nav) => {
      if (nav) {
        nav.addEventListener("click", function () {
          alert(
            `${this.querySelector("span").textContent} page layout is configured for LGU verification systems.`
          );
        });
      }
    });

    window.openDetailModal = openDetailModal;

    if (reportSearchInput) {
      reportSearchInput.addEventListener("input", renderReportsTable);
    }
    if (sortSelect) {
      sortSelect.addEventListener("change", renderReportsTable);
    }

    if (closeModalBtn) closeModalBtn.addEventListener("click", closeModal);
    if (modalBtnCloseSecondary) {
      modalBtnCloseSecondary.addEventListener("click", closeModal);
    }
    if (modalBtnSave) modalBtnSave.addEventListener("click", saveStatusChange);

    if (modalStatusSelect) {
      modalStatusSelect.addEventListener("change", function () {
        updateModalStatusBadge(this.value);
      });
    }

    window.saveStatusChange = saveStatusChange;

    const backdrop = document.getElementById("modal-backdrop");
    if (backdrop) backdrop.addEventListener("click", closeModal);

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" || e.key === "Esc") closeModal();
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
