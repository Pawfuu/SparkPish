/**
 * Basura-Pin — Photo capture & Gemini AI validation
 *
 * Flow:
 * 1. User snaps a photo → preview only (no API call)
 * 2. User fills reporter fields (optional) and clicks Submit
 * 3. Image + prompt sent to Gemini 3.1 Flash Lite
 * 4. Success/error flash modals + AI summary update
 */

import { GEMINI_API_KEY } from "./config.js";
import { submitTrashReport } from "../shared/report-service.js";

// ---------------------------------------------------------------------------
// API configuration
// Key lives in gitignored config.js — see config.example.js for setup.
// ---------------------------------------------------------------------------
const GEMINI_MODEL = "gemini-3.1-flash-lite";
const REQUEST_TIMEOUT_MS = 45000;

const API_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=` +
  GEMINI_API_KEY;

/** Base validator prompt — reporter notes appended at submit time if provided */
const VALIDATOR_PROMPT_BASE =
  'Analyze this image. Step 1: Does this image clearly show uncollected solid waste, garbage, or an illegal dumpsite? Step 2: If false, return the exact JSON: `{"valid": false, "error": "No waste detected"}`. Step 3: If true, estimate the volume and return JSON: `{"valid": true, "volume": "[estimate]", "severity_score": [1-5]}`.';

// DOM references
const photoInput = document.getElementById("trash-photo-input");
const summaryEl = document.getElementById("ai-summary");
const submitBtn = document.getElementById("submit-report-btn");
const submitSpinner = document.getElementById("submit-spinner");
const submitText = document.getElementById("submit-text");
const reporterName = document.getElementById("reporter-name");
const wasteCategory = document.getElementById("waste-category");
const contactInfo = document.getElementById("contact-info");
const reporterNotes = document.getElementById("reporter-notes");

if (!photoInput || !summaryEl || !submitBtn) {
  console.error(
    "Basura-Pin: Required elements (#trash-photo-input, #ai-summary, #submit-report-btn) not found.",
  );
}

// In-memory state for the selected photo (used on submit)
let selectedFile = null;
let previewObjectUrl = null;
let isSubmitting = false;

// ---------------------------------------------------------------------------
// Startup: validate API key configuration
// ---------------------------------------------------------------------------
function isApiKeyConfigured() {
  return (
    typeof GEMINI_API_KEY === "string" &&
    GEMINI_API_KEY.trim().length > 0 &&
    GEMINI_API_KEY !== "YOUR_GEMINI_API_KEY_HERE"
  );
}

if (!isApiKeyConfigured()) {
  console.error(
    "Basura-Pin: Missing API key. Copy config.example.js to config.js and add your Gemini key.",
  );
  if (summaryEl) {
    summaryEl.textContent =
      "App configuration incomplete. Copy config.example.js to config.js and add your Gemini API key.";
  }
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.classList.add("opacity-70", "cursor-not-allowed");
  }
}

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

/** Plain-text update for #ai-summary */
function setSummary(message) {
  if (summaryEl) {
    summaryEl.textContent = message;
  }
}

/** HTML update for image preview inside #ai-summary */
function setSummaryHtml(html) {
  if (summaryEl) {
    summaryEl.innerHTML = html;
  }
}

/** Toggle submit button loading state + spinner visibility */
function setSubmitLoading(isLoading) {
  if (!submitBtn) return;

  submitBtn.disabled = isLoading || !isApiKeyConfigured();
  submitBtn.classList.toggle("opacity-70", isLoading);
  submitBtn.classList.toggle("cursor-not-allowed", isLoading);
  submitBtn.classList.toggle("hover:scale-[1.02]", !isLoading);

  if (submitSpinner) {
    submitSpinner.classList.toggle("hidden", !isLoading);
  }
  if (submitText) {
    submitText.textContent = isLoading ? "Analyzing..." : "Submit Trash Report";
  }
}

/** Read optional reporter fields from the form */
function getReporterData() {
  return {
    name: reporterName ? reporterName.value.trim() : "",
    notes: reporterNotes ? reporterNotes.value.trim() : "",
  };
}

/** Read report fields used for Firestore submission */
function getReportFormData() {
  const contact = contactInfo ? contactInfo.value.trim() : "";
  return {
    wasteType: wasteCategory ? wasteCategory.value : "",
    contactInfo: contact || null,
  };
}

/** Resolve location from URL params or the header display */
function getReportLocation() {
  const params = new URLSearchParams(window.location.search);
  const barangay = params.get("barangay");
  const street = params.get("street");

  if (barangay && street) {
    return "Brgy " + barangay + ", " + street;
  }
  if (barangay) {
    return "Brgy " + barangay;
  }
  if (street) {
    return street;
  }

  const locEl = document.getElementById("street-location");
  if (locEl) {
    const text = locEl.textContent.replace(/^📍 Location:\s*/, "").trim();
    if (text) {
      return text;
    }
  }

  return "Unknown location";
}

/** Build the full prompt, optionally enriched with reporter notes */
function buildValidatorPrompt(notes) {
  if (!notes) {
    return VALIDATOR_PROMPT_BASE;
  }
  return (
    VALIDATOR_PROMPT_BASE + "\n\nAdditional context from the reporter: " + notes
  );
}

/** Normalize unknown errors into user-friendly messages */
function getErrorMessage(error) {
  if (!error) {
    return "Unknown error. Please try again.";
  }

  if (error.name === "AbortError") {
    return (
      "Request timed out after " +
      REQUEST_TIMEOUT_MS / 1000 +
      " seconds. Please check your connection and try again."
    );
  }

  if (error instanceof TypeError) {
    return "Network error — unable to reach the Gemini API. Check your internet connection.";
  }

  return error.message || "Unknown error. Please try again.";
}

// ---------------------------------------------------------------------------
// Photo preview (no API call on selection)
// ---------------------------------------------------------------------------

/** Revoke the previous blob URL to free memory */
function revokePreviewUrl() {
  if (previewObjectUrl) {
    URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = null;
  }
}

/** Render a thumbnail preview in the AI summary card */
function showPhotoPreview(file) {
  revokePreviewUrl();
  previewObjectUrl = URL.createObjectURL(file);

  setSummaryHtml(
    '<div class="space-y-3">' +
      "<img" +
      ' src="' +
      previewObjectUrl +
      '"' +
      ' alt="Preview of captured trash photo"' +
      ' class="w-full max-h-56 rounded-xl object-cover border border-gray-200 dark:border-zinc-700"' +
      "/>" +
      '<p class="text-gray-600 dark:text-gray-400">' +
      "Photo ready. Review the preview, add any notes, then tap " +
      "<strong>Submit Trash Report</strong>." +
      "</p>" +
      "</div>",
  );
}

if (photoInput) {
  photoInput.addEventListener("change", function (event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    selectedFile = file;
    showPhotoPreview(file);
  });
}

// ---------------------------------------------------------------------------
// Gemini API
// ---------------------------------------------------------------------------

/**
 * fetch wrapper with AbortController timeout so hung requests never block the UI.
 */
async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(function () {
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeoutId);
  }
}

/**
 * Read a File object and return { base64, mimeType }.
 * Strips the data-URL prefix so Gemini receives raw base64 only.
 */
function fileToBase64(file) {
  return new Promise(function (resolve, reject) {
    const reader = new FileReader();

    reader.onload = function () {
      const result = reader.result;
      const commaIndex = result.indexOf(",");
      const base64 = commaIndex >= 0 ? result.slice(commaIndex + 1) : result;
      resolve({
        base64: base64,
        mimeType: file.type || "image/jpeg",
      });
    };

    reader.onerror = function () {
      reject(new Error("Failed to read the selected image file."));
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Call Gemini generateContent with the image + validator prompt.
 * Uses generationConfig.responseMimeType to force strict JSON output.
 */
async function analyzeImageWithGemini(base64, mimeType, promptText) {
  const requestBody = {
    contents: [
      {
        parts: [
          { text: promptText },
          {
            inline_data: {
              mime_type: mimeType,
              data: base64,
            },
          },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
    },
  };

  const response = await fetchWithTimeout(
    API_URL,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    },
    REQUEST_TIMEOUT_MS,
  );

  if (!response.ok) {
    let errorText = "";
    try {
      errorText = await response.text();
    } catch (readError) {
      errorText = response.statusText;
    }
    throw new Error(
      "API request failed (" + response.status + "): " + errorText,
    );
  }

  const data = await response.json();
  return extractJsonFromGeminiResponse(data);
}

/** Pull the JSON string from Gemini's response envelope and parse it */
function extractJsonFromGeminiResponse(data) {
  const text =
    data &&
    data.candidates &&
    data.candidates[0] &&
    data.candidates[0].content &&
    data.candidates[0].content.parts &&
    data.candidates[0].content.parts[0] &&
    data.candidates[0].content.parts[0].text;

  if (!text) {
    throw new Error("Gemini returned an empty or unexpected response.");
  }

  try {
    return JSON.parse(text);
  } catch (parseError) {
    throw new Error("Could not parse Gemini JSON: " + text);
  }
}

// ---------------------------------------------------------------------------
// Submit handler
// ---------------------------------------------------------------------------

/** Update #ai-summary and open the appropriate flash modal */
function handleValidationResult(result, reporter, reportId, contact) {
  if (result.valid === true) {
    setSummary(
      "Trash detected!\n\n" +
        "Estimated volume: " +
        (result.volume || "Unknown") +
        "\n" +
        "Severity score: " +
        (result.severity_score != null ? result.severity_score : "N/A") +
        " / 5" +
        (reportId ? "\n\nReport ID: " + reportId : "") +
        (reporter.name ? "\n\nReported by: " + reporter.name : "") +
        (contact ? "\nContact: " + contact : ""),
    );

    if (typeof window.showSuccessModal === "function") {
      window.showSuccessModal();
    }
    return;
  }

  // Gracefully present error text without breaking DOM state
  setSummary(result.error || "No waste detected");

  if (typeof window.showErrorModal === "function") {
    window.showErrorModal();
  }
}

if (submitBtn) {
  submitBtn.addEventListener("click", async function () {
    if (isSubmitting) return;

    if (!isApiKeyConfigured()) {
      setSummary("API key missing. Copy config.example.js to config.js and add your Gemini API key.");
      return;
    }

    if (!selectedFile) {
      setSummary("Please snap a trash photo before submitting your report.");
      return;
    }

    const reportForm = getReportFormData();
    if (!reportForm.wasteType) {
      setSummary("Please select a trash category before submitting your report.");
      return;
    }

    const reporter = getReporterData();
    const promptText = buildValidatorPrompt(reporter.notes);

    isSubmitting = true;
    setSubmitLoading(true);
    setSummary("Analyzing image... please wait.");

    try {
      const imageData = await fileToBase64(selectedFile);
      const result = await analyzeImageWithGemini(
        imageData.base64,
        imageData.mimeType,
        promptText,
      );

      // Handle validation errors instantly before attempting Firestore uploads
      if (result.valid !== true) {
        handleValidationResult(result, reporter);
        setSubmitLoading(false);
        isSubmitting = false;
        return;
      }

      setSummary("Trash verified. Uploading report... please wait.");

      // Fixed: Passing contactInfo, notes, and severityScore straight to the data service
      const reportData = {
        wasteType: reportForm.wasteType,
        volumeEstimate: result.volume || "Unknown",
        location: getReportLocation(),
        contactInfo: reportForm.contactInfo,
        notes: reporter.notes,
        severityScore: result.severity_score != null ? result.severity_score : 3
      };

      const reportId = await submitTrashReport(reportData, selectedFile);

      console.log("Basura-Pin report submitted:", {
        reporter: reporter,
        validation: result,
        reportId: reportId,
      });

      handleValidationResult(result, reporter, reportId, reportForm.contactInfo);
    } catch (error) {
      console.error("Basura-Pin submission error:", error);
      setSummary("Something went wrong while processing your report.\n\n" + getErrorMessage(error));

      if (typeof window.showErrorModal === "function") {
        window.showErrorModal();
      }
    } finally {
      isSubmitting = false;
      setSubmitLoading(false);
    }
  });
}
