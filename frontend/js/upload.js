/**
 * Upload Module - Admin Only
 */

window.uploadModule = {
    init() {
        this.dropZone = document.getElementById('drop-zone');
        this.fileInput = document.getElementById('file-input');
        this.progressContainer = document.getElementById('upload-progress');
        this.progressFill = document.getElementById('progress-fill');
        this.progressPct = document.getElementById('progress-pct');
        this.progressFilename = document.getElementById('progress-filename');
        this.docGrid = document.getElementById('doc-grid');

        this.bindEvents();
        this.loadDocuments();
    },

    bindEvents() {
        // Dropzone interactions
        this.dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.dropZone.classList.add('dragover');
        });

        this.dropZone.addEventListener('dragleave', () => {
            this.dropZone.classList.remove('dragover');
        });

        this.dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            this.dropZone.classList.remove('dragover');
            const files = e.dataTransfer.files;
            if (files.length) this.handleUpload(files[0]);
        });

        this.dropZone.addEventListener('click', () => {
            this.fileInput.click();
        });

        this.fileInput.addEventListener('change', (e) => {
            if (e.target.files.length) this.handleUpload(e.target.files[0]);
            this.fileInput.value = ''; // reset
        });

        document.getElementById('refresh-docs').addEventListener('click', () => {
            this.loadDocuments();
        });
    },

    async handleUpload(file) {
        if (file.size > 50 * 1024 * 1024) {
            app.showToast('File too large. Max 50MB.', 'error');
            return;
        }

        const allowed = ['.pdf', '.txt', '.docx'];
        const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
        if (!allowed.includes(ext)) {
            app.showToast('Invalid file format. Upload PDF, TXT, or DOCX.', 'error');
            return;
        }

        // UI Feedback
        this.dropZone.style.display = 'none';
        this.progressContainer.style.display = 'block';
        this.progressFilename.textContent = file.name;

        let progress = 0;
        const fakeProgress = setInterval(() => {
            progress += Math.random() * 15;
            if (progress > 90) progress = 90;
            this.progressFill.style.width = `${progress}%`;
            this.progressPct.textContent = `${Math.round(progress)}%`;
        }, 500);

        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await app.fetchAuth('/api/documents/upload', {
                method: 'POST',
                // Don't set Content-Type header manually when sending FormData, browser handles boundary
                body: formData
            });

            clearInterval(fakeProgress);

            if (!res.ok) throw new Error((await res.json()).detail || 'Upload failed');

            const data = await res.json();

            this.progressFill.style.width = `100%`;
            this.progressPct.textContent = `100%`;
            app.showToast(`Ingested ${data.chunk_count} chunks from ${file.name}`, 'success');

            setTimeout(() => {
                this.resetUploader();
                this.loadDocuments();
            }, 1000);

        } catch (err) {
            clearInterval(fakeProgress);
            this.resetUploader();
            app.showToast(err.message, 'error');
        }
    },

    resetUploader() {
        this.dropZone.style.display = 'flex';
        this.progressContainer.style.display = 'none';
        this.progressFill.style.width = '0%';
    },

    async loadDocuments() {
        try {
            const res = await app.fetchAuth('/api/documents');
            const data = await res.json();
            this.renderDocs(data.documents);
        } catch (err) {
            console.error('Failed to load documents', err);
        }
    },

    renderDocs(docs) {
        this.docGrid.innerHTML = '';
        if (!docs || docs.length === 0) {
            this.docGrid.innerHTML = '<div class="empty-state">No documents ingested yet.</div>';
            return;
        }

        docs.forEach(doc => {
            const card = document.createElement('div');
            card.className = 'doc-card';

            // Format nice date
            let dateStr = 'Unknown';
            if (doc.uploaded_at) {
                const d = new Date(doc.uploaded_at);
                dateStr = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            }

            card.innerHTML = `
                <div class="doc-info">
                    <h4 style="margin-bottom: 5px;">${doc.filename}</h4>
                    <span style="font-size: 0.8rem; color: var(--text-secondary);">
                        ${doc.chunk_count} chunks • Added ${dateStr}
                    </span>
                </div>
                <button class="btn-ghost" data-id="${doc.document_id}" title="Delete Document">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                </button>
            `;

            const delBtn = card.querySelector('.btn-ghost');
            delBtn.addEventListener('click', () => this.deleteDocument(doc.document_id, doc.filename));

            this.docGrid.appendChild(card);
        });
    },

    async deleteDocument(doc_id, filename) {
        if (!confirm(`Are you sure you want to delete ${filename} and all its vectors?`)) return;

        try {
            const res = await app.fetchAuth(`/api/documents/${doc_id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Delete failed');

            app.showToast(`Deleted ${filename}`, 'success');
            this.loadDocuments();
        } catch (err) {
            app.showToast(err.message, 'error');
        }
    }
};
