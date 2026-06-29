/**
 * Basura-Pin — Photo capture & Gemini AI validation
 *
 * Flow:
 * 1. User snaps a photo → preview only (no API call)
 * 2. User fills reporter fields (optional) and clicks Submit
 * 3. Image + prompt sent to Gemini 3.1 Flash Lite
 * 4. Success/error flash modals + AI summary update
 */

(function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // API configuration
  // WARNING: Avoid committing real API keys to public repos.
  // ---------------------------------------------------------------------------
  const GEMINI_API_KEY = "process.env.GEMINI_API_KEY";
  const API_URL =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=" +
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
  const reporterEmail = document.getElementById("reporter-email");
  const reporterNotes = document.getElementById("reporter-notes");

  if (!photoInput || !summaryEl || !submitBtn) {
    console.error(
      "Basura-Pin: Required elements (#trash-photo-input, #ai-summary, #submit-report-btn) not found.",
    );
    return;
  }

  // In-memory state for the selected photo (used on submit)
  var selectedFile = null;
  var previewObjectUrl = null;

  // ---------------------------------------------------------------------------
  // UI helpers
  // ---------------------------------------------------------------------------

  /** Plain-text update for #ai-summary */
  function setSummary(message) {
    summaryEl.textContent = message;
  }

  /** HTML update for image preview inside #ai-summary */
  function setSummaryHtml(html) {
    summaryEl.innerHTML = html;
  }

  /** Toggle submit button loading state + spinner visibility */
  function setSubmitLoading(isLoading) {
    submitBtn.disabled = isLoading;
    submitBtn.classList.toggle("opacity-70", isLoading);
    submitBtn.classList.toggle("cursor-not-allowed", isLoading);
    submitBtn.classList.toggle("hover:scale-[1.02]", !isLoading);

    if (submitSpinner) {
      submitSpinner.classList.toggle("hidden", !isLoading);
    }
    if (submitText) {
      submitText.textContent = isLoading
        ? "Analyzing..."
        : "Submit Trash Report";
    }
  }

  /** Read optional reporter fields from the form */
  function getReporterData() {
    return {
      name: reporterName ? reporterName.value.trim() : "",
      email: reporterEmail ? reporterEmail.value.trim() : "",
      notes: reporterNotes ? reporterNotes.value.trim() : "",
    };
  }

  /** Build the full prompt, optionally enriched with reporter notes */
  function buildValidatorPrompt(notes) {
    if (!notes) {
      return VALIDATOR_PROMPT_BASE;
    }
    return (
      VALIDATOR_PROMPT_BASE +
      "\n\nAdditional context from the reporter: " +
      notes
    );
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

  photoInput.addEventListener("change", function (event) {
    var file = event.target.files && event.target.files[0];

    if (!file) {
      return;
    }

    selectedFile = file;
    showPhotoPreview(file);
  });

  // ---------------------------------------------------------------------------
  // Gemini API
  // ---------------------------------------------------------------------------

  /**
   * Read a File object and return { base64, mimeType }.
   * Strips the data-URL prefix so Gemini receives raw base64 only.
   */
  function fileToBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();

      reader.onload = function () {
        var result = reader.result;
        var commaIndex = result.indexOf(",");
        var base64 = commaIndex >= 0 ? result.slice(commaIndex + 1) : result;
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
    var requestBody = {
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

    var response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      var errorText = "";
      try {
        errorText = await response.text();
      } catch (e) {
        errorText = response.statusText;
      }
      throw new Error(
        "API request failed (" + response.status + "): " + errorText,
      );
    }

    var data = await response.json();
    return extractJsonFromGeminiResponse(data);
  }

  /** Pull the JSON string from Gemini's response envelope and parse it */
  function extractJsonFromGeminiResponse(data) {
    var text =
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
  function handleValidationResult(result, reporter) {
    if (result.valid === true) {
      setSummary(
        "Trash detected!\n\n" +
          "Estimated volume: " +
          (result.volume || "Unknown") +
          "\n" +
          "Severity score: " +
          (result.severity_score != null ? result.severity_score : "N/A") +
          " / 5" +
          (reporter.name ? "\n\nReported by: " + reporter.name : "") +
          (reporter.email ? "\nContact: " + reporter.email : ""),
      );

      if (typeof window.showSuccessModal === "function") {
        window.showSuccessModal();
      }
      return;
    }

    setSummary(result.error || "No waste detected");

    if (typeof window.showErrorModal === "function") {
      window.showErrorModal();
    }
  }

  submitBtn.addEventListener("click", async function () {
    if (!selectedFile) {
      setSummary("Please snap a trash photo before submitting your report.");
      return;
    }

    var reporter = getReporterData();
    var promptText = buildValidatorPrompt(reporter.notes);

    setSubmitLoading(true);
    setSummary("Analyzing image... please wait.");

    try {
      var imageData = await fileToBase64(selectedFile);
      var result = await analyzeImageWithGemini(
        imageData.base64,
        imageData.mimeType,
        promptText,
      );

      // Reporter data is collected for the report payload (ready for backend wiring)
      console.log("Basura-Pin report submitted:", {
        reporter: reporter,
        validation: result,
      });

      handleValidationResult(result, reporter);
    } catch (error) {
      console.error("Basura-Pin analysis error:", error);

      setSummary(
        "Something went wrong while analyzing your photo.\n\n" +
          (error.message || "Unknown network error."),
      );

      if (typeof window.showErrorModal === "function") {
        window.showErrorModal();
      }
    } finally {
      setSubmitLoading(false);
    }
  });
})();
