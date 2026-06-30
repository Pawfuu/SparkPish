import { db, storage } from "./firebase-config.js";
import {
  ref,
  uploadBytes,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";
import {
  collection,
  addDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

function uniqueReportFilename(imageFile) {
  const ext = imageFile.name?.includes(".")
    ? imageFile.name.split(".").pop()
    : "jpg";
  const randomSuffix = Math.random().toString(36).slice(2, 8);
  return `${Date.now()}-${randomSuffix}.${ext}`;
}

/**
 * Uploads a trash report image and persists metadata to Firestore.
 *
 * @param {object} reportData - { wasteType, volumeEstimate, location, contactInfo, notes, severityScore }
 * @param {File} imageFile - Raw image file from a file input
 * @returns {Promise<string>} Firestore document ID
 */
export async function submitTrashReport(reportData, imageFile) {
  const filename = uniqueReportFilename(imageFile);
  const storageRef = ref(storage, `reports/${filename}`);

  await uploadBytes(storageRef, imageFile);
  const imageUrl = await getDownloadURL(storageRef);

  // Updated schema mapping matches LGU interface 1:1
  const docRef = await addDoc(collection(db, "reports"), {
    imageUrl,
    wasteType: reportData.wasteType,
    volumeEstimate: reportData.volumeEstimate,
    location: reportData.location,
    coordinates: reportData.coordinates || null,
    status: "pending",
    contactInfo: reportData.contactInfo || null,
    notes: reportData.notes || "",
    severityScore: reportData.severityScore != null ? Number(reportData.severityScore) : 3,
    createdAt: serverTimestamp(),
  });

  return docRef.id;
}