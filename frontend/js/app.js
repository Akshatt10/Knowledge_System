/**
 * Main Application Logic - V2
 * Handles tsParticles, Auth, Routing, and Auth Fetch Wrapper
 */

const API_BASE = 'http://localhost:8000/api';

const app = {
    token: localStorage.getItem('kis_token'),
    role: localStorage.getItem('kis_role'),
    email: localStorage.getItem('kis_email'),

    init() {
        this.initParticles();
        this.checkAuth();
        this.bindEvents();
    },

    initParticles() {
        tsParticles.load("tsparticles", {
            preset: "triangles",
            background: { color: "transparent" },
            particles: {
                color: { value: ["#00f0ff", "#ff007f", "#0050ff"] },
                links: { color: "random", opacity: 0.2, distance: 150 },
                move: { speed: 1.5 },
                size: { value: { min: 1, max: 3 } },
                opacity: { value: 0.5 }
            }
        });
    },

    checkAuth() {
        if (this.token) {
            this.showApp();
        } else {
            document.getElementById('auth-overlay').classList.add('active');
            document.getElementById('app-container').style.display = 'none';
        }
    },

    showApp() {
        document.getElementById('auth-overlay').classList.remove('active');
        document.getElementById('app-container').style.display = 'grid';

        // Populate profile
        document.getElementById('display-email').textContent = this.email || 'User';
        document.getElementById('display-role').textContent = this.role || 'USER';

        const avatarText = (this.email ? this.email.charAt(0).toUpperCase() : 'U');
        document.getElementById('user-avatar').textContent = avatarText;

        // RBAC logic
        if (this.role === 'ADMIN') {
            document.getElementById('display-role').classList.add('admin');
            document.querySelector('.admin-only').style.display = 'block';
        } else {
            document.getElementById('display-role').classList.remove('admin');
            document.querySelector('.admin-only').style.display = 'none';
        }

        // Initialize modules if they expose an init function
        if (window.chatModule) window.chatModule.init();
        if (window.uploadModule && this.role === 'ADMIN') window.uploadModule.init();
        if (window.adminModule && this.role === 'ADMIN') window.adminModule.init();
    },

    bindEvents() {
        // Navigation Routing
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                // Remove active from all navs
                document.querySelectorAll('.nav-link').forEach(n => n.classList.remove('active'));
                // Hide all views
                document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));

                // Set active
                link.classList.add('active');
                const viewId = 'view-' + link.dataset.view;
                document.getElementById(viewId).classList.add('active');

                // Trigger refresh if needed
                if (link.dataset.view === 'upload' && window.uploadModule) {
                    window.uploadModule.loadDocuments();
                } else if (link.dataset.view === 'admin' && window.adminModule) {
                    window.adminModule.loadStats();
                }
            });
        });

        // Auth Tabs
        document.querySelectorAll('.auth-tab').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
                btn.classList.add('active');

                const isRegister = btn.dataset.tab === 'register';
                document.getElementById('role-group').style.display = isRegister ? 'block' : 'none';
                document.getElementById('auth-submit').querySelector('.btn-text').textContent = isRegister ? 'Create Account' : 'Sign In';
            });
        });

        // Auth Form Submit
        document.getElementById('auth-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const isRegister = document.querySelector('.auth-tab.active').dataset.tab === 'register';
            const email = document.getElementById('auth-email').value;
            const password = document.getElementById('auth-password').value;
            const role = document.getElementById('auth-role').value;

            const submitBtn = document.getElementById('auth-submit');
            const originalText = submitBtn.querySelector('.btn-text').textContent;
            submitBtn.querySelector('.btn-text').textContent = 'Authenticating...';
            submitBtn.disabled = true;

            try {
                if (isRegister) {
                    const res = await fetch(`${API_BASE}/auth/register`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email, password, role })
                    });
                    if (!res.ok) throw new Error((await res.json()).detail || 'Registration failed');
                    const data = await res.json();
                    this.loginSuccess(data, email);
                } else {
                    const formData = new URLSearchParams();
                    formData.append('username', email); // OAuth2 expects username
                    formData.append('password', password);

                    const res = await fetch(`${API_BASE}/auth/login`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        body: formData
                    });
                    if (!res.ok) throw new Error('Invalid email or password');
                    const data = await res.json();
                    this.loginSuccess(data, email);
                }
            } catch (err) {
                document.getElementById('auth-error').textContent = err.message;
            } finally {
                submitBtn.querySelector('.btn-text').textContent = originalText;
                submitBtn.disabled = false;
            }
        });

        // Logout
        document.getElementById('logout-btn').addEventListener('click', () => {
            localStorage.removeItem('kis_token');
            localStorage.removeItem('kis_role');
            localStorage.removeItem('kis_email');
            this.token = null;
            this.role = null;
            this.email = null;

            // clear chat
            const chatMessages = document.getElementById('chat-messages');
            chatMessages.innerHTML = `
                <div class="message ai">
                    <div class="avatar">✨</div>
                    <div class="message-content">
                        Hello! I am your advanced RAG Intelligence Agent. I can analyze documents from our secure S3 / MinIO knowledge base. What would you like to know?
                    </div>
                </div>
            `;

            this.checkAuth();
        });
    },

    loginSuccess(data, email) {
        this.token = data.access_token;
        this.role = data.role;
        this.email = email;

        localStorage.setItem('kis_token', this.token);
        localStorage.setItem('kis_role', this.role);
        localStorage.setItem('kis_email', this.email);

        this.showApp();
        app.showToast(`Welcome back, ${email}`, 'success');
    },

    /**
     * Wrapper for fetch that auto-injects JWT token.
     */
    async fetchAuth(url, options = {}) {
        if (!options.headers) options.headers = {};
        options.headers['Authorization'] = `Bearer ${this.token}`;

        // Ensure we hit the correct backend port locally
        const fetchUrl = url.startsWith('/api') ? url.replace('/api', API_BASE) : url;
        const res = await fetch(fetchUrl, options);
        if (res.status === 401 || res.status === 403) {
            // Token expired or forbidden
            this.showToast("Session expired or unauthorized.", "error");
            document.getElementById('logout-btn').click();
            throw new Error("Unauthorized");
        }
        return res;
    },

    showToast(message, type = 'success') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;

        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }
};

// Start
document.addEventListener('DOMContentLoaded', () => app.init());
