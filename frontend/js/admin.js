/**
 * Admin Stats Module
 */

window.adminModule = {
    init() {
        this.statDocs = document.getElementById('stat-docs');
        this.statChunks = document.getElementById('stat-chunks');
        this.statCollection = document.getElementById('stat-collection');
        this.healthBadge = document.getElementById('health-badge');
    },

    async loadStats() {
        try {
            // Check health
            const hRes = await fetch(`${API_BASE}/health`); // unsecured
            if (hRes.ok) {
                this.healthBadge.className = 'badge success';
                this.healthBadge.textContent = 'Operational';
            } else {
                this.healthBadge.className = 'badge admin';
                this.healthBadge.textContent = 'Degraded';
            }

            // Check Stats (secured)
            const res = await app.fetchAuth('/api/admin/stats');
            if (res.ok) {
                const data = await res.json();
                this.animateValue(this.statDocs, data.total_documents);
                this.animateValue(this.statChunks, data.total_chunks);
                this.statCollection.textContent = data.collection_name;
            }
        } catch (err) {
            console.error("Stats error", err);
            this.healthBadge.className = 'badge admin';
            this.healthBadge.textContent = 'Offline';
        }
    },

    animateValue(obj, end, duration = 1000) {
        let startTimestamp = null;
        const step = (timestamp) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / duration, 1);
            obj.innerHTML = Math.floor(progress * end);
            if (progress < 1) {
                window.requestAnimationFrame(step);
            }
        };
        window.requestAnimationFrame(step);
    }
};
