/**
 * Chat Logic (RAG Interface) - V2
 */

window.chatModule = {
    history: [],

    init() {
        this.form = document.getElementById('chat-form');
        this.input = document.getElementById('chat-input');
        this.messagesContainer = document.getElementById('chat-messages');
        this.providerToggle = document.getElementById('provider-toggle'); // checkbox

        // Enter key to submit, Shift+Enter for newline
        this.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.form.dispatchEvent(new Event('submit'));
            }
        });

        this.form.addEventListener('submit', (e) => this.handleSubmit(e));
    },

    async handleSubmit(e) {
        e.preventDefault();
        const question = this.input.value.trim();
        if (!question) return;

        // Clear input, resize
        this.input.value = '';
        this.input.style.height = 'auto';

        // Add user message to UI
        this.appendMessage('user', question);

        // Add typing indicator
        const typingId = this.appendTypingIndicator();

        // Get Provider
        const provider = this.providerToggle.checked ? "openai" : "gemini";

        try {
            const res = await app.fetchAuth('/api/query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    question,
                    provider,
                    chat_history: this.history
                })
            });

            if (!res.ok) throw new Error('Query failed');

            const data = await res.json();

            // Remove typing indicator
            document.getElementById(typingId).remove();

            // Render AI Response
            this.appendMessage('ai', data.answer, data.sources);

            // Update semantic history
            this.history.push({ role: "user", content: question });
            this.history.push({ role: "assistant", content: data.answer });

        } catch (err) {
            document.getElementById(typingId).remove();
            this.appendMessage('ai', '⚠️ Error contacting the intelligence engine. Ensure your API keys are valid.');
            app.showToast('Query error', 'error');
        }
    },

    appendMessage(role, text, sources = []) {
        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${role}`;

        let avatar = role === 'user' ? (app.email ? app.email.charAt(0).toUpperCase() : 'U') : '✨';

        // Robust Markdown-lite Parsing
        let lines = text.split('\n');
        let inList = false;
        let formattedHtml = '';

        lines.forEach(line => {
            let processed = line
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank">$1</a>');

            const isListItem = processed.trim().startsWith('* ') || processed.trim().startsWith('- ');

            if (isListItem) {
                if (!inList) {
                    formattedHtml += '<ul style="margin: 10px 0 10px 20px; padding: 0;">';
                    inList = true;
                }
                formattedHtml += `<li style="margin-bottom: 5px;">${processed.trim().substring(2)}</li>`;
            } else {
                if (inList) {
                    formattedHtml += '</ul>';
                    inList = false;
                }
                if (processed.trim()) {
                    formattedHtml += `<p style="margin-bottom: 10px;">${processed}</p>`;
                }
            }
        });
        if (inList) formattedHtml += '</ul>';

        let formattedText = formattedHtml;

        let sourcesHtml = '';
        if (sources && sources.length > 0) {
            sourcesHtml = '<details class="citations-dropdown">';
            sourcesHtml += '<summary>SOURCES CITED</summary>';
            sourcesHtml += '<div class="citations-list">';
            sources.forEach(src => {
                const score = src.relevance_score ? Math.round(src.relevance_score * 100) : 100;
                sourcesHtml += `
                    <div class="citation-card">
                        <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                            <strong>📄 ${src.filename}</strong>
                            <span style="opacity: 0.7;">${score}% Match</span>
                        </div>
                        <div style="opacity: 0.8; font-style: italic;">"${src.chunk_excerpt}"</div>
                    </div>
                `;
            });
            sourcesHtml += '</div></details>';
        }

        msgDiv.innerHTML = `
            <div class="avatar">${avatar}</div>
            <div class="message-content">
                ${formattedText}
                ${sourcesHtml}
            </div>
        `;

        this.messagesContainer.appendChild(msgDiv);
        this.scrollToBottom();
    },

    appendTypingIndicator() {
        const id = 'typing-' + Date.now();
        const msgDiv = document.createElement('div');
        msgDiv.className = `message ai`;
        msgDiv.id = id;

        msgDiv.innerHTML = `
            <div class="avatar">✨</div>
            <div class="message-content" style="display:flex; gap: 4px; padding: 20px;">
                <div class="dot-typing"></div>
            </div>
        `;
        this.messagesContainer.appendChild(msgDiv);
        this.scrollToBottom();
        return id;
    },

    scrollToBottom() {
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }
};
