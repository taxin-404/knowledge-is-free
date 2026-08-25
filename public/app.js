const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("file-input");
const progress = document.getElementById("progress");
const progressBar = document.getElementById("progress-bar");
const progressLabel = document.getElementById("progress-label");
const cardsEl = document.getElementById("cards");
const countEl = document.getElementById("count");
const emptyEl = document.getElementById("empty");

const reader = document.getElementById("reader");
const readerFrame = document.getElementById("reader-frame");
const readerTitle = document.getElementById("reader-title");
const readerDownload = document.getElementById("reader-download");
const readerClose = document.getElementById("reader-close");

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

async function loadFiles() {
  const res = await fetch("/api/files");
  const files = await res.json();
  cardsEl.innerHTML = "";
  countEl.textContent = `${files.length} document${files.length === 1 ? "" : "s"}`;
  emptyEl.hidden = files.length > 0;

  files.forEach((f, i) => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <span class="card-tab">PDF</span>
      <div class="card-body">
        <div class="card-name">${escapeHtml(f.name)}</div>
        <div class="card-meta">${formatSize(f.size)} · filed ${formatDate(f.uploaded_at)}</div>
      </div>
      <button class="card-delete" data-id="${f.id}">Remove</button>
    `;
    card.querySelector(".card-body").addEventListener("click", () => openReader(f));
    card.querySelector(".card-tab").addEventListener("click", () => openReader(f));
    card.querySelector(".card-delete").addEventListener("click", (e) => {
      e.stopPropagation();
      deleteFile(f.id);
    });
    cardsEl.appendChild(card);
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function openReader(f) {
  readerTitle.textContent = f.name;
  readerFrame.src = `/api/files/${f.id}`;
  readerDownload.href = `/api/files/${f.id}`;
  readerDownload.download = f.name;
  reader.hidden = false;
}

readerClose.addEventListener("click", () => {
  reader.hidden = true;
  readerFrame.src = "";
});

async function deleteFile(id) {
  if (!confirm("Remove this document from the vault?")) return;
  await fetch(`/api/files/${id}`, { method: "DELETE" });
  loadFiles();
}

async function uploadFile(file) {
  if (file.type !== "application/pdf") {
    alert("Only PDF files are accepted.");
    return;
  }
  const form = new FormData();
  form.append("file", file);

  progress.hidden = false;
  progressBar.style.width = "10%";
  progressLabel.textContent = "Filing...";

  try {
    const xhr = new XMLHttpRequest();
    await new Promise((resolve, reject) => {
      xhr.open("POST", "/api/upload");
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          progressBar.style.width = `${(e.loaded / e.total) * 100}%`;
        }
      };
      xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(xhr.responseText)));
      xhr.onerror = () => reject(new Error("upload failed"));
      xhr.send(form);
    });
    progressLabel.textContent = "Filed.";
  } catch (err) {
    progressLabel.textContent = "Failed — try again.";
    console.error(err);
  } finally {
    setTimeout(() => (progress.hidden = true), 800);
    loadFiles();
  }
}

dropzone.addEventListener("click", (e) => {
  // click handled by <label for> already opening the input; avoid double-trigger
});
fileInput.addEventListener("change", () => {
  if (fileInput.files[0]) uploadFile(fileInput.files[0]);
  fileInput.value = "";
});

["dragenter", "dragover"].forEach((evt) =>
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.add("drag");
  })
);
["dragleave", "drop"].forEach((evt) =>
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.remove("drag");
  })
);
dropzone.addEventListener("drop", (e) => {
  const file = e.dataTransfer.files[0];
  if (file) uploadFile(file);
});

loadFiles();
