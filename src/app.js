import { FileZillaCrypto, parseFileZillaXML } from './filezilla-crypto.js';

// --- Übersetzung ---
const translations = {
    en: {
        subtitle: "Decrypt FileZilla Exports (Hybrid Crypt: X25519 + AES-GCM)",
        warnTitle: "Warning: WebCrypto API unavailable!",
        warnText: "Browsers block crypto functions on insecure connections (http). Please use HTTPS or localhost.",
        dropTitle: "Drop XML file here",
        dropSub: "or click to select",
        reset: "Reset",
        searchPlaceholder: "Search...",
        masterPlaceholder: "Master Password",
        items: "Entries",
        passEncrypted: "Encrypted",
        passDecrypted: "Decrypted!",
        passPassword: "Password",
        wrongPass: "Wrong Password?",
        needPass: "Master Password required",
        noEntries: "No server entries found in file.",
        readError: "Error reading file.",
        copyTooltip: "Copy URL",
        toggleTooltip: "Show/Hide",
        exportUris: "Export URIs",
        qrTooltip: "Show QR Code",
        qrMissingPass: "No password (still encrypted)"
    },
    de: {
        subtitle: "Entschlüsselt FileZilla Exporte (Hybrid Crypt: X25519 + AES-GCM)",
        warnTitle: "Achtung: WebCrypto API nicht verfügbar!",
        warnText: "Einige Browser blockieren Krypto-Funktionen über unsicheres HTTP. Bitte über HTTPS oder localhost nutzen.",
        dropTitle: "XML Datei hier ablegen",
        dropSub: "oder klicken zum Auswählen",
        reset: "Zurücksetzen",
        searchPlaceholder: "Suchen...",
        masterPlaceholder: "Export-Passwort",
        items: "Einträge",
        passEncrypted: "Verschlüsselt",
        passDecrypted: "Entschlüsselt!",
        passPassword: "Passwort",
        wrongPass: "Passwort falsch?",
        needPass: "Export-Passwort benötigt",
        noEntries: "Keine Server-Einträge in der Datei gefunden.",
        readError: "Fehler beim Lesen der Datei.",
        copyTooltip: "URL kopieren",
        toggleTooltip: "Anzeigen/Verbergen",
        exportUris: "URIs exportieren",
        qrTooltip: "QR-Code anzeigen",
        qrMissingPass: "Ohne Passwort (noch verschlüsselt)"
    }
};

export class FileZillaApp {
    constructor() {
        // Sprache initialisieren (Standard Englisch, außer Browser ist Deutsch)
        this.lang = navigator.language.startsWith('de') ? 'de' : 'en';

        try {
            this.crypto = new FileZillaCrypto();
        } catch (e) {
            console.error("Crypto Error:", e);
            document.getElementById('crypto-warning').classList.remove('hidden');
        }

        this.servers = [];
        this.fileName = "";
        this.workingIterations = null;
        this.searchTerm = "";
        this.masterPassword = "";

        // UI Cache
        this.elDropZone = document.getElementById('drop-zone');
        this.elDashboard = document.getElementById('dashboard');
        this.elFileInput = document.getElementById('file-input');
        this.elErrorContent = document.getElementById('drop-content-error');
        this.elDefaultContent = document.getElementById('drop-content-default');
        this.elErrorMessage = document.getElementById('error-message');
        this.elMasterPass = document.getElementById('master-password');
        this.elSearch = document.getElementById('search-input');
        this.elServerGrid = document.getElementById('server-grid');
        this.elFilename = document.getElementById('filename-display');
        this.elCount = document.getElementById('count-display');
        this.elStatusIcon = document.getElementById('status-icon-container');
        this.elLangToggle = document.getElementById('lang-toggle');
        this.elLangLabel = document.getElementById('lang-label');
        this.elExportUriBtn = document.getElementById('export-uri-btn');

        this.bindEvents();
        this.updateLanguage(); // Texte setzen
        this.renderIcons();
    }

    t(key) {
        return translations[this.lang][key] || key;
    }

    updateLanguage() {
        // HTML Elemente aktualisieren
        document.querySelectorAll('[data-i18n]').forEach(el => {
            el.textContent = this.t(el.dataset.i18n);
        });

        // Platzhalter
        this.elSearch.placeholder = this.t('searchPlaceholder');
        this.elMasterPass.placeholder = this.t('masterPlaceholder');

        // Toggle Button Update
        this.elLangLabel.textContent = this.lang === 'en' ? 'English' : 'Deutsch';
        const flag = this.elLangToggle.querySelector('span');
        flag.textContent = this.lang === 'en' ? '🇺🇸' : '🇩🇪';

        // Wenn Server angezeigt werden, neu rendern (für Status-Texte)
        if (!this.elDashboard.classList.contains('hidden')) {
            this.renderServers();
        }
    }

    bindEvents() {
        // Sprache umschalten
        this.elLangToggle.addEventListener('click', () => {
            this.lang = this.lang === 'en' ? 'de' : 'en';
            this.updateLanguage();
        });

        // Drag & Drop
        this.elDropZone.addEventListener('dragover', (e) => { e.preventDefault(); this.elDropZone.classList.add('drag-active'); });
        this.elDropZone.addEventListener('dragleave', () => this.elDropZone.classList.remove('drag-active'));
        this.elDropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            this.elDropZone.classList.remove('drag-active');
            if (e.dataTransfer.files[0]) this.processFile(e.dataTransfer.files[0]);
        });
        this.elDropZone.addEventListener('click', () => this.elFileInput.click());
        this.elFileInput.addEventListener('change', (e) => { if(e.target.files[0]) this.processFile(e.target.files[0]); });

        // Reset
        document.getElementById('reset-btn-error').addEventListener('click', (e) => { e.stopPropagation(); this.reset(); });
        document.getElementById('reset-btn-main').addEventListener('click', () => this.reset());

        // Export URI Button
        if (this.elExportUriBtn) {
            this.elExportUriBtn.addEventListener('click', () => this.exportURIs());
        }

        // Password Input
        let debounceTimer;
        this.elMasterPass.addEventListener('input', (e) => {
            this.masterPassword = e.target.value;
            this.elStatusIcon.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 text-orange-500 animate-spin"></i>`;
            this.renderIcons();
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => this.attemptDecryption(), 500);
        });

        this.elSearch.addEventListener('input', (e) => {
            this.searchTerm = e.target.value;
            this.renderServers();
        });

        // Click Delegation für dynamische Buttons
        document.addEventListener('click', (e) => {
            const btnCopy = e.target.closest('[data-action="copy"]');
            if (btnCopy) this.handleCopy(btnCopy);
            
            const btnToggle = e.target.closest('[data-action="toggle-pass"]');
            if (btnToggle) this.handleTogglePass(btnToggle);

            const btnQr = e.target.closest('[data-action="toggle-qr"]');
            if (btnQr) this.handleToggleQR(btnQr);
        });
    }

    renderIcons() {
        if (window.lucide) window.lucide.createIcons();
    }

    reset() {
        this.servers = [];
        this.fileName = "";
        this.masterPassword = "";
        this.searchTerm = "";
        this.workingIterations = null;
        this.elMasterPass.value = "";
        this.elSearch.value = "";
        this.elFileInput.value = "";
        this.elDashboard.classList.add('hidden');
        this.elDropZone.classList.remove('hidden');
        this.elErrorContent.classList.add('hidden');
        this.elDefaultContent.classList.remove('hidden');
        this.elDropZone.classList.remove('border-red-300', 'bg-red-50');
    }

    processFile(file) {
        this.fileName = file.name;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                this.servers = parseFileZillaXML(e.target.result);
                if (this.servers.length === 0) throw new Error(this.t('noEntries'));
                this.showDashboard();
            } catch (err) {
                console.error(err);
                this.showError(err.message || this.t('readError'));
            }
        };
        reader.onerror = () => this.showError(this.t('readError'));
        reader.readAsText(file);
    }

    showError(msg) {
        this.elDefaultContent.classList.add('hidden');
        this.elErrorContent.classList.remove('hidden');
        this.elErrorMessage.textContent = msg;
        this.elDropZone.classList.add('border-red-300', 'bg-red-50');
    }

    showDashboard() {
        this.elDropZone.classList.add('hidden');
        this.elDashboard.classList.remove('hidden');
        this.elFilename.textContent = this.fileName;
        this.renderServers();
    }

    async attemptDecryption() {
        if (!this.masterPassword) {
            this.elStatusIcon.innerHTML = `<i data-lucide="lock" class="w-4 h-4 text-orange-400"></i>`;
            this.renderIcons();
            return;
        }

        let updated = false;
        for (let s of this.servers) {
            if (s.passType === 'crypt' && !s.decryptedValue) {
                const result = await this.crypto.decryptString(s.password, s.salt, this.masterPassword, this.workingIterations);
                if (result) {
                    if (!this.workingIterations) this.workingIterations = result.iterationsUsed;
                    s.decryptedValue = result.text;
                    s.decryptionError = false;
                    updated = true;
                } else {
                    s.decryptionError = true;
                    updated = true;
                }
            }
        }
        this.elStatusIcon.innerHTML = `<i data-lucide="lock" class="w-4 h-4 text-orange-400"></i>`;
        this.renderIcons();
        if (updated) this.renderServers(); // Rendert neu und schließt dadurch ggf. offene QR-Container
    }

    handleTogglePass(btn) {
        const id = btn.dataset.id;
        const server = this.servers.find(s => s.id === id);
        if (server) {
            server.showPass = !server.showPass;
            this.renderServers();
        }
    }

    exportURIs() {
        if (!this.servers || this.servers.length === 0) return;

        // Generiere die URIs für jeden Server
        const uriLines = this.servers.map(server => {
            let proto = 'ftp';
            if (server.protocol.includes('SFTP')) proto = 'sftp';
            else if (server.protocol.includes('FTPS')) proto = 'ftps';
            else if (server.protocol.includes('HTTP')) proto = server.protocol.toLowerCase().includes('https') ? 'https' : 'http';

            const finalPass = server.decryptedValue || (server.passType !== 'crypt' ? server.password : '');
            
            const safeUser = encodeURIComponent(server.user);
            const safePass = finalPass ? `:${encodeURIComponent(finalPass)}` : '';
            const safePath = server.path ? `/${server.path.split(' / ').map(p => encodeURIComponent(p)).join('/')}` : '';

            return `${proto}://${safeUser}${safePass}@${server.host}:${server.port}${safePath}`;
        });

        // Erstelle eine Textdatei und löse den Download aus
        const blob = new Blob([uriLines.join('\n')], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        
        const baseName = this.fileName ? this.fileName.replace(/\.xml$/i, '') : 'filezilla_export';
        a.download = `${baseName}_uris.txt`;
        
        a.href = url;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    handleCopy(btn) {
        const id = btn.dataset.id;
        const server = this.servers.find(s => s.id === id);
        if (!server) return;
        const proto = server.protocol.includes('SFTP') ? 'sftp' : 'ftp';
        const finalPass = server.decryptedValue || (server.passType !== 'crypt' ? server.password : '');
        const passPart = finalPass ? `:${finalPass}` : '';
        const text = `${proto}://${server.user}${passPart}@${server.host}:${server.port}`;

        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        try {
            document.execCommand('copy');
            const originalContent = btn.innerHTML;
            btn.innerHTML = `<i data-lucide="check" class="w-5 h-5 text-green-500"></i>`;
            this.renderIcons();
            setTimeout(() => { btn.innerHTML = originalContent; this.renderIcons(); }, 2000);
        } catch (e) { console.error("Copy failed", e); }
        document.body.removeChild(ta);
    }

    handleToggleQR(btn) {
        const id = btn.dataset.id;
        const server = this.servers.find(s => s.id === id);
        if (!server) return;

        const container = document.getElementById(`qr-container-${id}`);
        const canvas = document.getElementById(`qr-canvas-${id}`);
        const warningEl = document.getElementById(`qr-warning-${id}`);
        
        if (!container || !canvas) return;

        // Container auf-/zuklappen
        if (!container.classList.contains('hidden')) {
            container.classList.add('hidden');
            container.classList.remove('flex');
            return;
        }
        
        // Anzeigen (flex nutzen, damit es zentriert bleibt)
        container.classList.remove('hidden');
        container.classList.add('flex');

        // Nur generieren, wenn es nicht schon passiert ist
        if (canvas.dataset.rendered === "true") return;

        // Protokoll ermitteln
        let proto = 'ftp';
        if (server.protocol.includes('SFTP')) proto = 'sftp';
        else if (server.protocol.includes('FTPS')) proto = 'ftps';
        else if (server.protocol.includes('HTTP')) proto = server.protocol.toLowerCase().includes('https') ? 'https' : 'http';

        // WICHTIG: Prüfen, ob das Passwort noch verschlüsselt ist
        const isMissingPassword = server.passType === 'crypt' && !server.decryptedValue;
        const finalPass = server.decryptedValue || (server.passType !== 'crypt' ? server.password : '');
        
        const safeUser = encodeURIComponent(server.user);
        const safePass = finalPass ? `:${encodeURIComponent(finalPass)}` : '';
        const safePath = server.path ? `/${server.path.split(' / ').map(p => encodeURIComponent(p)).join('/')}` : '';

        const uri = `${proto}://${safeUser}${safePass}@${server.host}:${server.port}${safePath}`;

        // Warnung einblenden, falls das Passwort fehlt
        if (isMissingPassword && warningEl) {
            warningEl.classList.remove('hidden');
        }

        // bwip-js ausführen
        try {
            window.bwipjs.toCanvas(canvas, {
                bcid: 'qrcode',
                text: uri,
                scale: 3, 
                padding: 2,
                backgroundcolor: 'FFFFFF'
            });
            canvas.dataset.rendered = "true";
        } catch (e) {
            console.error("QR Code Fehler:", e);
            container.innerHTML = `<span class="text-xs text-red-500">QR Error</span>`;
        }
    }

    renderServers() {
        this.elCount.textContent = `${this.servers.length} ${this.t('items')}`;
        const term = this.searchTerm.toLowerCase();
        const filtered = this.servers.filter(s =>
            s.name.toLowerCase().includes(term) ||
            s.host.toLowerCase().includes(term) ||
            s.user.toLowerCase().includes(term)
        );
        this.elServerGrid.innerHTML = filtered.map(s => this.buildServerCard(s)).join('');
        this.renderIcons();
    }

    buildServerCard(s) {
        const isSuccess = s.decryptedValue !== null;
        const displayPass = s.decryptedValue || s.password;
        const borderClass = isSuccess ? 'border-green-200 ring-1 ring-green-100' : 'border-slate-200';
        const iconBg = s.protocol.includes('SFTP') ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600';

        let passSection = '';
        if (s.passType !== 'none') {
            let statusIcon = 'key-round';
            let statusColor = 'text-slate-400';
            let statusText = this.t('passPassword');
            let boxClass = 'bg-slate-50 border-slate-100';

            if (s.passType === 'crypt') {
                statusIcon = 'lock';
                statusColor = 'text-orange-500';
                statusText = this.t('passEncrypted');
                boxClass = 'bg-orange-50 border-orange-100';
            }
            if (isSuccess) {
                statusIcon = 'unlock';
                statusColor = 'text-green-600';
                statusText = this.t('passDecrypted');
                boxClass = 'bg-green-50 border-green-200';
            }

            let content = `<div class="text-slate-400 text-xs pl-1">••••••••</div>`;
            if (s.showPass) {
                if (s.passType === 'crypt' && !isSuccess) {
                    content = this.masterPassword ?
                        `<div class="text-xs text-red-500 font-medium flex items-center gap-1"><i data-lucide="alert-circle" class="w-3 h-3"></i> ${this.t('wrongPass')}</div>` :
                        `<div class="text-xs text-orange-600 italic">${this.t('needPass')}</div>`;
                } else {
                    content = `<div class="font-mono text-slate-800 select-all break-all text-xs bg-white p-1 rounded border border-slate-100 shadow-sm">${this.escapeHtml(displayPass)}</div>`;
                }
            }

            passSection = `
            <div class="flex flex-col gap-2 mt-2 p-2 rounded border transition-colors ${boxClass}">
                <div class="flex items-center gap-3 text-slate-600">
                    <i data-lucide="${statusIcon}" class="w-4 h-4 ${statusColor} shrink-0"></i>
                    <div class="flex-1 min-w-0">
                        <span class="text-xs ${isSuccess ? 'text-green-700 font-bold' : (s.passType === 'crypt' ? 'text-orange-700 font-medium' : 'text-slate-500')}">${statusText}</span>
                    </div>
                    <button data-action="toggle-pass" data-id="${s.id}" class="text-slate-400 hover:text-slate-600" title="${this.t('toggleTooltip')}">
                        <i data-lucide="${s.showPass ? 'eye-off' : 'eye'}" class="w-4 h-4"></i>
                    </button>
                </div>
                <div class="min-h-[1.5em]">${content}</div>
            </div>`;
        }

        return `
        <div class="bg-white rounded-xl border shadow-sm hover:shadow-md transition-all p-5 flex flex-col gap-4 ${borderClass}">
            <div class="flex justify-between items-start">
                <div class="flex items-center gap-2 overflow-hidden">
                    <div class="p-2 rounded-lg shrink-0 ${iconBg}">
                        <i data-lucide="server" class="w-5 h-5"></i>
                    </div>
                    <div class="min-w-0">
                        <h3 class="font-bold text-slate-800 leading-tight truncate pr-2">${this.escapeHtml(s.name)}</h3>
                        <span class="text-xs text-slate-500 font-medium">${s.protocol}</span>
                    </div>
                </div>
                
                <div class="flex items-center gap-1 shrink-0">
                    <button data-action="toggle-qr" data-id="${s.id}" class="p-1.5 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded transition-colors" title="${this.t('qrTooltip')}">
                        <i data-lucide="qr-code" class="w-5 h-5"></i>
                    </button>
                    <button data-action="copy" data-id="${s.id}" class="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" title="${this.t('copyTooltip')}">
                        <i data-lucide="copy" class="w-5 h-5"></i>
                    </button>
                </div>
            </div>
            
            <div class="space-y-2 text-sm">
                <div class="flex items-center gap-3 text-slate-600">
                    <i data-lucide="globe" class="w-4 h-4 text-slate-400 shrink-0"></i>
                    <span class="truncate font-mono bg-slate-50 px-1.5 py-0.5 rounded text-slate-700">${this.escapeHtml(s.host)}</span>
                </div>
                <div class="flex items-center gap-3 text-slate-600">
                    <i data-lucide="user" class="w-4 h-4 text-slate-400 shrink-0"></i>
                    <span class="truncate">${this.escapeHtml(s.user)}</span>
                </div>
                ${passSection}
            </div>
            
            ${s.path ? `<div class="pt-2 border-t border-slate-100"><p class="text-xs text-slate-400 truncate flex items-center gap-1"><i data-lucide="folder-open" class="w-3 h-3"></i> ${this.escapeHtml(s.path)}</p></div>` : '<div class="mt-auto"></div>'}
            
            <div id="qr-container-${s.id}" class="hidden flex-col items-center justify-center pt-4 border-t border-slate-100 fade-in">
                
                <div id="qr-warning-${s.id}" class="hidden mb-3 px-2 py-1 bg-orange-50 text-orange-600 border border-orange-200 rounded text-[11px] font-medium items-center gap-1.5 shadow-sm">
                    <i data-lucide="alert-triangle" class="w-3.5 h-3.5"></i> 
                    ${this.t('qrMissingPass')}
                </div>
                
                <div class="bg-white p-2 rounded-lg border border-slate-200 shadow-sm">
                    <canvas id="qr-canvas-${s.id}" class="max-w-full block" style="image-rendering: pixelated;"></canvas>
                </div>
                <span class="text-[11px] text-slate-400 mt-2 font-medium">Scan to Connect</span>
            </div>
        </div>`;
    }

    escapeHtml(text) {
        if (!text) return "";
        return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }
}