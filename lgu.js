/**
 * LGU Administrator Portal Application Logic
 * 
 * Features:
 * - Local storage of reports seed data
 * - View switching (Dashboard Overview vs Detailed Reports List)
 * - Realtime searching & column sorting on reports list
 * - Detailed Drill-down modal for viewing/editing individual reports
 * - Responsive dynamic status summary cards
 */

(function () {
  'use strict';

  // Seed Data: 8 distinct civic reports mimicking real-world conditions
  const SEED_REPORTS = [
    {
      id: "1000001",
      category: "Pothole",
      location: "San Francisco City Mall St",
      submittedBy: "Admin Portal",
      status: "Resolved",
      aiVolume: "Small (under 1 bag)",
      severity: 2,
      notes: "Small but deep hole right in front of the convenience store entrance."
    },
    {
      id: "1000002",
      category: "Flooding",
      location: "320 Street Ons Rd",
      submittedBy: "Janan Portal",
      status: "Resolved",
      aiVolume: "Large (clogged drain)",
      severity: 4,
      notes: "Severe overflow reaching the sidewalk during light rain. Needs cleanout."
    },
    {
      id: "1000003",
      category: "Flooding",
      location: "San Francisco City Mall St",
      submittedBy: "Jarran Creeer",
      status: "In Progress",
      aiVolume: "Medium pile",
      severity: 3,
      notes: "Water levels rising. Blockage detected in main concrete culvert."
    },
    {
      id: "1000004",
      category: "Streetlight",
      location: "326 Street Lars St",
      submittedBy: "Jaknin Bunch",
      status: "Resolved",
      aiVolume: "N/A",
      severity: 1,
      notes: "Bulb has been flickering for 3 days now, completely dark tonight."
    },
    {
      id: "1000005",
      category: "Flooding",
      location: "323 Street Fore St",
      submittedBy: "Jaffan Wixner",
      status: "Resolved",
      aiVolume: "Medium",
      severity: 3,
      notes: "Blocked sewer grate is causing localized ponding near the crosswalk."
    },
    {
      id: "1000006",
      category: "Streetlight",
      location: "426 Street Lars St",
      submittedBy: "Jakein Brittar",
      status: "Resolved",
      aiVolume: "N/A",
      severity: 1,
      notes: "Physical damage to the metal pole fixture from a minor truck side swipe."
    },
    {
      id: "1000007",
      category: "Pothole",
      location: "237 Street Laws St",
      submittedBy: "Jasnin Dunch",
      status: "In Progress",
      aiVolume: "Small pile",
      severity: 2,
      notes: "Pavement crack is deteriorating quickly due to heavy construction vehicles."
    },
    {
      id: "1000008",
      category: "Pothole",
      location: "331 Street Fwrs St",
      submittedBy: "Johnn Portal",
      status: "Resolved",
      aiVolume: "Medium (1-3 bags)",
      severity: 3,
      notes: "Deep trench forming near water utility access point. Hazard to motorcycles."
    }
  ];

  // Initialize state from local storage or defaults
  const STORAGE_KEY = 'lgu-admin-reports';
  let reports = [];

  function loadReports() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        reports = JSON.parse(saved);
      } catch (e) {
        reports = [...SEED_REPORTS];
      }
    } else {
      reports = [...SEED_REPORTS];
      saveReports();
    }
  }

  function saveReports() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(reports));
  }

  // DOM Elements
  const navDashboardBtn = document.getElementById('nav-dashboard');
  const navReportsBtn = document.getElementById('nav-reports');
  const navMapBtn = document.getElementById('nav-map');
  const navAnalyticsBtn = document.getElementById('nav-analytics');
  const navSettingsBtn = document.getElementById('nav-settings');

  const viewDashboardPanel = document.getElementById('view-dashboard-panel');
  const viewReportsPanel = document.getElementById('view-reports-panel');
  const viewTitle = document.getElementById('view-title');

  // Stats Elements
  const statActiveEl = document.getElementById('stat-active');
  const statPendingEl = document.getElementById('stat-pending');
  const statProgressEl = document.getElementById('stat-progress');
  const statResolvedEl = document.getElementById('stat-resolved');

  // Table & Interaction Elements
  const reportsTableBody = document.getElementById('reports-table-body');
  const reportSearchInput = document.getElementById('report-search-input');
  const sortSelect = document.getElementById('sort-select');
  const tableResultsCounter = document.getElementById('table-results-counter');

  // Modal Elements
  const reportDetailModal = document.getElementById('report-detail-modal');
  const modalReportId = document.getElementById('modal-report-id');
  const modalCategory = document.getElementById('modal-category');
  const modalLocation = document.getElementById('modal-location');
  const modalSubmitter = document.getElementById('modal-submitter');
  const modalAiVolume = document.getElementById('modal-ai-volume');
  const modalSeverityScore = document.getElementById('modal-severity-score');
  const modalNotes = document.getElementById('modal-notes');
  const modalStatusBadge = document.getElementById('modal-status-badge');
  const modalStatusSelect = document.getElementById('modal-status-select');
  const modalReportImage = document.getElementById('modal-report-image');

  const closeModalBtn = document.getElementById('close-modal-btn');
  const modalBtnCloseSecondary = document.getElementById('modal-btn-close-secondary');
  const modalBtnSave = document.getElementById('modal-btn-save');

  // Current active report in the modal
  let selectedReport = null;

  // Initialize
  function init() {
    loadReports();
    updateDashboardStats();
    renderReportsTable();
    setupEventListeners();
    updateDateDisplay();
  }

  // Update Header Date
  function updateDateDisplay() {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const dateStr = new Date().toLocaleDateString('en-US', options);
    const dateEl = document.getElementById('header-date');
    if (dateEl) {
      dateEl.textContent = dateStr;
    }
  }

  // Update Dashboard Overview Counts
  function updateDashboardStats() {
    const totalCount = reports.length;
    const resolvedCount = reports.filter(r => r.status === 'Resolved').length;
    const progressCount = reports.filter(r => r.status === 'In Progress').length;
    const pendingCount = reports.filter(r => r.status === 'Pending Verification').length;

    // Set UI Values
    if (statActiveEl) statActiveEl.textContent = String(totalCount);
    if (statPendingEl) statPendingEl.textContent = String(pendingCount);
    if (statProgressEl) statProgressEl.textContent = String(progressCount);
    if (statResolvedEl) statResolvedEl.textContent = String(resolvedCount);
  }

  // View Navigation Switcher
  function switchView(viewName) {
    // Reset buttons styles to inactive
    const navButtons = [navDashboardBtn, navReportsBtn, navMapBtn, navAnalyticsBtn, navSettingsBtn];
    navButtons.forEach(btn => {
      if (btn) {
        btn.classList.remove('bg-blue-50', 'text-blue-700', 'font-semibold');
        btn.classList.add('text-slate-600', 'hover:bg-slate-50', 'hover:text-slate-900', 'font-medium');
      }
    });

    // Hide all view panels
    viewDashboardPanel.classList.add('hidden');
    viewReportsPanel.classList.add('hidden');

    if (viewName === 'dashboard') {
      viewDashboardPanel.classList.remove('hidden');
      if (navDashboardBtn) {
        navDashboardBtn.classList.add('bg-blue-50', 'text-blue-700', 'font-semibold');
        navDashboardBtn.classList.remove('text-slate-600', 'hover:bg-slate-50', 'hover:text-slate-900', 'font-medium');
      }
      viewTitle.textContent = "Dashboard";
      updateDashboardStats();
    } else if (viewName === 'reports') {
      viewReportsPanel.classList.remove('hidden');
      if (navReportsBtn) {
        navReportsBtn.classList.add('bg-blue-50', 'text-blue-700', 'font-semibold');
        navReportsBtn.classList.remove('text-slate-600', 'hover:bg-slate-50', 'hover:text-slate-900', 'font-medium');
      }
      viewTitle.textContent = "Civic Reports Database";
      renderReportsTable();
    }
  }

  // Dynamic Table Renderer with search & sort
  function renderReportsTable() {
    if (!reportsTableBody) return;

    let query = reportSearchInput ? reportSearchInput.value.toLowerCase().trim() : '';
    let sortedList = [...reports];

    // 1. Search Filter
    if (query) {
      sortedList = sortedList.filter(item => 
        item.id.toLowerCase().includes(query) ||
        item.category.toLowerCase().includes(query) ||
        item.location.toLowerCase().includes(query) ||
        item.submittedBy.toLowerCase().includes(query) ||
        item.status.toLowerCase().includes(query)
      );
    }

    // 2. Sort Logic
    const sortVal = sortSelect ? sortSelect.value : 'id-desc';
    sortedList.sort((a, b) => {
      if (sortVal === 'id-asc') {
        return a.id.localeCompare(b.id);
      } else if (sortVal === 'id-desc') {
        return b.id.localeCompare(a.id);
      } else if (sortVal === 'status-asc') {
        return a.status.localeCompare(b.status);
      } else if (sortVal === 'status-desc') {
        return b.status.localeCompare(a.status);
      }
      return 0;
    });

    // 3. Render HTML
    reportsTableBody.innerHTML = '';
    
    if (sortedList.length === 0) {
      reportsTableBody.innerHTML = `
        <tr>
          <td colspan="6" class="px-6 py-12 text-center text-slate-500 font-medium bg-slate-50/50">
            No matching reports found in database.
          </td>
        </tr>
      `;
      if (tableResultsCounter) tableResultsCounter.textContent = 'Showing 0 reports';
      return;
    }

    if (tableResultsCounter) {
      tableResultsCounter.textContent = `Showing ${sortedList.length} of ${reports.length} reports`;
    }

    sortedList.forEach(report => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-50/80 transition-colors border-b border-slate-100 align-middle';

      // Status indicator circular badge helper
      let badgeColorClass = 'bg-slate-400 text-slate-700';
      let dotColorClass = 'bg-slate-400';
      if (report.status === 'Resolved') {
        badgeColorClass = 'bg-green-50 text-green-700 border border-green-200';
        dotColorClass = 'bg-green-500';
      } else if (report.status === 'In Progress') {
        badgeColorClass = 'bg-amber-50 text-amber-700 border border-amber-200';
        dotColorClass = 'bg-amber-500';
      } else if (report.status === 'Pending Verification') {
        badgeColorClass = 'bg-slate-100 text-slate-700 border border-slate-200';
        dotColorClass = 'bg-slate-500';
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
            data-id="${report.id}" 
            class="action-view-btn text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors px-3 py-1.5 rounded bg-blue-50 hover:bg-blue-100 inline-flex items-center gap-1"
          >
            <!-- View Edit Icon -->
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
            <span>View</span>
          </button>
        </td>
      `;
      reportsTableBody.appendChild(tr);
    });

    // Add events on dynamically generated action buttons
    const viewButtons = reportsTableBody.querySelectorAll('.action-view-btn');
    viewButtons.forEach(btn => {
      btn.addEventListener('click', function () {
        const id = this.getAttribute('data-id');
        openDetailModal(id);
      });
    });
  }

  // Open drill down details modal
  function openDetailModal(id) {
    selectedReport = reports.find(r => r.id === id);
    if (!selectedReport) return;

    modalReportId.textContent = `Report #${selectedReport.id}`;
    modalCategory.textContent = selectedReport.category;
    modalLocation.textContent = selectedReport.location;
    modalSubmitter.textContent = selectedReport.submittedBy;
    modalAiVolume.textContent = selectedReport.aiVolume || "N/A";
    modalSeverityScore.textContent = String(selectedReport.severity || 0);
    modalNotes.textContent = selectedReport.notes ? `"${selectedReport.notes}"` : '"No additional comments provided."';

    // Status select dropdown match
    modalStatusSelect.value = selectedReport.status;

    // Render badge state in modal
    updateModalStatusBadge(selectedReport.status);

    // Dynamic Image Placeholder choice based on category
    if (selectedReport.category === 'Flooding') {
      modalReportImage.src = 'https://images.unsplash.com/photo-1547683905-f686c993aae5?q=80&w=400&auto=format&fit=crop';
    } else if (selectedReport.category === 'Pothole') {
      modalReportImage.src = 'https://images.unsplash.com/photo-1515162305285-0293e4767cc2?q=80&w=400&auto=format&fit=crop';
    } else {
      modalReportImage.src = 'https://images.unsplash.com/photo-1530587191325-3db32d826c18?q=80&w=400&auto=format&fit=crop';
    }

    // Show modal container
    reportDetailModal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
  }

  function updateModalStatusBadge(status) {
    modalStatusBadge.className = 'inline-flex items-center gap-2 mt-1 px-3 py-1 rounded-full text-xs font-semibold';
    let dotEl = modalStatusBadge.querySelector('span:first-child');
    let textEl = modalStatusBadge.querySelector('span:last-child');
    
    if (!dotEl) {
      modalStatusBadge.innerHTML = '<span class="w-2 h-2 rounded-full"></span><span></span>';
      dotEl = modalStatusBadge.querySelector('span:first-child');
      textEl = modalStatusBadge.querySelector('span:last-child');
    }

    textEl.textContent = status;

    if (status === 'Resolved') {
      modalStatusBadge.classList.add('bg-green-50', 'text-green-700', 'border', 'border-green-200');
      dotEl.className = 'w-2 h-2 rounded-full bg-green-500';
    } else if (status === 'In Progress') {
      modalStatusBadge.classList.add('bg-amber-50', 'text-amber-700', 'border', 'border-amber-200');
      dotEl.className = 'w-2 h-2 rounded-full bg-amber-500';
    } else {
      modalStatusBadge.classList.add('bg-slate-100', 'text-slate-700', 'border', 'border-slate-200');
      dotEl.className = 'w-2 h-2 rounded-full bg-slate-400';
    }
  }

  function closeModal() {
    reportDetailModal.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
    selectedReport = null;
  }

  // Save report status changes
  function saveStatusChange() {
    if (!selectedReport) return;
    const newStatus = modalStatusSelect.value;
    
    // Update local state
    selectedReport.status = newStatus;
    
    // Write back to reports list
    const index = reports.findIndex(r => r.id === selectedReport.id);
    if (index !== -1) {
      reports[index] = { ...selectedReport };
      saveReports();
    }

    closeModal();
    updateDashboardStats();
    renderReportsTable();
  }

  // Set Event Listeners
  function setupEventListeners() {
    // Left Nav Items
    if (navDashboardBtn) {
      navDashboardBtn.addEventListener('click', () => switchView('dashboard'));
    }
    if (navReportsBtn) {
      navReportsBtn.addEventListener('click', () => switchView('reports'));
    }
    // Static navigation stubs for presentation
    const dummyNavs = [navMapBtn, navAnalyticsBtn, navSettingsBtn];
    dummyNavs.forEach(nav => {
      if (nav) {
        nav.addEventListener('click', function () {
          alert(`${this.querySelector('span').textContent} page layout is configured for LGU verification systems.`);
        });
      }
    });

    // Realtime Searching
    if (reportSearchInput) {
      reportSearchInput.addEventListener('input', renderReportsTable);
    }

    // Sort order selections
    if (sortSelect) {
      sortSelect.addEventListener('change', renderReportsTable);
    }

    // Modal Events
    if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
    if (modalBtnCloseSecondary) modalBtnCloseSecondary.addEventListener('click', closeModal);
    if (modalBtnSave) modalBtnSave.addEventListener('click', saveStatusChange);
    
    // Handle changes to status select dropdown inside modal to update badge view real-time
    if (modalStatusSelect) {
      modalStatusSelect.addEventListener('change', function () {
        updateModalStatusBadge(this.value);
      });
    }

    // Backdrop click close
    const backdrop = document.getElementById('modal-backdrop');
    if (backdrop) {
      backdrop.addEventListener('click', closeModal);
    }

    // Keyboard ESC close
    document.addEventListener('keydown', function (e) {
      if (e.key === "Escape" || e.key === "Esc") {
        closeModal();
      }
    });
  }

  // Start app
  document.addEventListener('DOMContentLoaded', init);

})();
