document.addEventListener('DOMContentLoaded', () => {
    // --- Supabase Initialization ---
    let supabase = null;
    if (typeof CONFIG !== 'undefined' && CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY && CONFIG.SUPABASE_URL !== 'YOUR_SUPABASE_URL') {
        try {
            console.log("Initializing Supabase with URL:", CONFIG.SUPABASE_URL);
            supabase = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
            console.log("Supabase initialized successfully");
        } catch (e) {
            console.error("Failed to initialize Supabase", e);
        }
    } else {
        console.warn("Supabase configuration missing or invalid. Using local storage only.");
        console.log("CONFIG state:", typeof CONFIG !== 'undefined' ? CONFIG : "undefined");
    }

    // State
    let participants = [];
    let currentPairs = [];
    let currentSlug = null; // Store the current draw's slug

    // DOM Elements
    const setupView = document.getElementById('setup-view');
    const adminView = document.getElementById('admin-view');
    const revealView = document.getElementById('reveal-view');

    const participantInput = document.getElementById('participant-name');
    const addBtn = document.getElementById('add-btn');
    const participantsList = document.getElementById('participants-list');
    const drawBtn = document.getElementById('draw-btn');
    const circleModeCheckbox = document.getElementById('circle-mode');
    const maxValueInput = document.getElementById('max-value');
    const revealDateInput = document.getElementById('reveal-date');

    const resultsList = document.getElementById('results-list');
    const resetBtn = document.getElementById('reset-btn');
    const verifyBtn = document.getElementById('verify-btn');

    const verifyModal = document.getElementById('verify-modal');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const verificationList = document.getElementById('verification-list');

    const giftBoxTrigger = document.getElementById('gift-box-trigger');
    const revealContent = document.getElementById('reveal-content');
    const giverNameDisplay = document.getElementById('giver-name');
    const receiverNameDisplay = document.getElementById('receiver-name');
    const displayDate = document.getElementById('display-date');
    const displayValue = document.getElementById('display-value');

    const toast = document.getElementById('toast');

    // New Elements for URL Display
    const urlDisplay = document.getElementById('url-display');
    const generatedUrlSpan = document.getElementById('generated-url');
    const copyUrlBtn = document.getElementById('copy-url-btn');

    // --- Initialization ---
    checkUrlForReveal();

    // --- Event Listeners ---
    addBtn.addEventListener('click', addParticipant);
    participantInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addParticipant();
    });

    drawBtn.addEventListener('click', performDraw);
    resetBtn.addEventListener('click', resetApp);
    verifyBtn.addEventListener('click', verifyResults);
    closeModalBtn.addEventListener('click', () => verifyModal.classList.remove('active'));

    giftBoxTrigger.addEventListener('click', () => {
        giftBoxTrigger.style.display = 'none';
        revealContent.classList.remove('hidden');
        confettiEffect();
    });

    if (copyUrlBtn) {
        copyUrlBtn.addEventListener('click', () => {
            const url = generatedUrlSpan.textContent;
            if (url && url !== '...') {
                navigator.clipboard.writeText(url).then(() => showToast("Link copiado!"));
            }
        });
    }

    // --- Core Functions ---

    async function checkUrlForReveal() {
        const urlParams = new URLSearchParams(window.location.search);
        const dataParam = urlParams.get('data');
        const idParam = urlParams.get('id'); // Friendly Slug
        const userParam = urlParams.get('u'); // User for individual link (Secret ID or Slug)
        const adminParam = urlParams.get('admin'); // Admin Token

        // Case 1: Legacy URL (base64 data)
        if (dataParam) {
            try {
                const decoded = decodeData(dataParam);
                if (decoded.master) {
                    restoreAdminView(decoded);
                } else {
                    showRevealView(decoded);
                }
                return;
            } catch (e) {
                console.error("Invalid legacy data", e);
            }
        }

        // Case 2: Friendly URL (Supabase Slug)
        if (idParam) {
            if (!supabase) {
                showToast("Erro: Banco de dados não conectado para carregar este sorteio.", "error");
                showSetupView();
                return;
            }

            try {
                // Fetch draw data from Supabase
                const { data, error } = await supabase
                    .from('draws')
                    .select('draw_data')
                    .eq('slug', idParam)
                    .single();

                if (error || !data) {
                    console.error("Draw not found or error:", error);
                    showToast("Sorteio não encontrado.", "error");
                    showSetupView();
                    return;
                }

                const drawData = data.draw_data;
                currentSlug = idParam; // Store for context

                if (userParam) {
                    // Individual Link: Find the pair for this user
                    // Try to find by Secret ID first (Secure)
                    let pair = drawData.pairs.find(p => p.secretId === userParam);

                    // Fallback: Try to find by Name Slug (Legacy/Insecure - for old draws only)
                    if (!pair) {
                        pair = drawData.pairs.find(p => generateSlug(p.giver) === userParam);
                    }

                    if (pair) {
                        const revealData = {
                            g: pair.giver,
                            r: pair.receiver,
                            v: drawData.maxValue,
                            d: drawData.revealDate
                        };
                        showRevealView(revealData);
                    } else {
                        showToast("Participante não encontrado neste sorteio.", "error");
                        showSetupView();
                    }
                } else {
                    // Master Link: Check for Admin Token
                    // If draw has an adminToken, REQUIRE it to match
                    if (drawData.adminToken) {
                        if (adminParam === drawData.adminToken) {
                            restoreAdminView(drawData);
                        } else {
                            showToast("Acesso Negado: Link de administrador inválido.", "error");
                            showSetupView();
                        }
                    } else {
                        // Legacy draws without adminToken: Allow access (or block if you prefer strict security)
                        // For now, allowing backward compatibility
                        restoreAdminView(drawData);
                    }
                }

            } catch (e) {
                console.error("Exception loading draw:", e);
                showSetupView();
            }
        } else {
            showSetupView();
        }
    }

    // ... (rest of functions) ...

    async function generateMasterLink() {
        if (!urlDisplay) return;

        const adminToken = generateSecretId(); // Reuse random string generator for admin token

        const masterData = {
            master: true,
            pairs: currentPairs,
            maxValue: maxValueInput.value,
            revealDate: revealDateInput.value,
            adminToken: adminToken // Save token in data
        };

        // Default to legacy encoding if Supabase is down
        let fullUrl = '';
        let slug = null;

        if (supabase && participants.length > 0) {
            // Generate Friendly Slug based on first participant
            const firstName = participants[0];
            slug = await getUniqueSlug(firstName);
        }

        if (slug) {
            // Use Friendly URL with Admin Token
            currentSlug = slug;
            const baseUrl = window.location.href.split('?')[0];
            fullUrl = `${baseUrl}?id=${slug}&admin=${adminToken}`;

            // Save full data to Supabase
            await saveToHistory(fullUrl, currentPairs.length, slug, masterData);
        } else {
            // Fallback to Legacy URL
            const encoded = encodeData(masterData);
            const baseUrl = window.location.href.split('?')[0];
            fullUrl = `${baseUrl}?data=${encoded}`;
            await saveToHistory(fullUrl, currentPairs.length, null, null);
        }

        // Show loading state or full URL first
        generatedUrlSpan.textContent = fullUrl;
        urlDisplay.classList.remove('hidden');

        // Automatically update the browser URL so it's saved in history
        window.history.pushState({ path: fullUrl }, '', fullUrl);

        // Update individual links now that we have the slug (or not)
        updateIndividualLinks();

        // Try to shorten the URL (optional)
        try {
            const shortUrl = await shortenUrl(fullUrl);
            if (shortUrl) {
                generatedUrlSpan.textContent = shortUrl;
            }
        } catch (error) {
            console.error("Failed to shorten URL:", error);
        }
    }

    async function saveToHistory(url, count, slug = null, drawData = null) {
        console.log("Attempting to save draw to history...", { url, count, slug });
        const timestamp = new Date().toISOString();

        // 1. Save to LocalStorage (Always do this as backup)
        try {
            const history = JSON.parse(localStorage.getItem('amigoSecretoHistory') || '[]');
            const newItem = {
                id: Date.now(),
                date: timestamp,
                participants: count,
                url: url,
                slug: slug // Store slug locally too if available
            };
            history.unshift(newItem); // Add to beginning
            localStorage.setItem('amigoSecretoHistory', JSON.stringify(history));
            console.log("Saved to LocalStorage");
        } catch (e) {
            console.error("Failed to save local history", e);
        }

        // 2. Try Supabase
        if (supabase) {
            try {
                console.log("Saving to Supabase 'draws' table...");

                const payload = {
                    url: url,
                    participants_count: count,
                    created_at: timestamp
                };

                if (slug && drawData) {
                    payload.slug = slug;
                    payload.draw_data = drawData;
                }

                const { data, error } = await supabase
                    .from('draws')
                    .insert([payload]);

                if (error) {
                    console.error("Supabase save ERROR:", error);
                    let msg = "Erro ao salvar no histórico online.";
                    if (error.code === 'PGRST204' && error.message.includes('Could not find the')) {
                        msg += " Coluna faltando no Supabase (slug ou draw_data).";
                    }
                    // Don't show toast for duplicate key error (slug collision handled elsewhere, but just in case)
                    if (error.code !== '23505') {
                        showToast(msg, "error");
                    }
                } else {
                    console.log("Supabase save SUCCESS:", data);
                }
            } catch (e) {
                console.error("Supabase save EXCEPTION:", e);
            }
        }
    }

    function showSetupView() {
        setupView.classList.add('active');
        adminView.classList.remove('active');
        revealView.classList.remove('active');
        setupView.classList.remove('hidden');
        adminView.classList.add('hidden');
        revealView.classList.add('hidden');
    }

    function restoreAdminView(data) {
        setupView.classList.remove('active');
        setupView.classList.add('hidden');
        revealView.classList.remove('active');
        revealView.classList.add('hidden');

        adminView.classList.add('active');
        adminView.classList.remove('hidden');

        // Restore state
        currentPairs = data.pairs;
        maxValueInput.value = data.maxValue || '';
        revealDateInput.value = data.revealDate || '';

        // Render results
        renderResults();
        updateIndividualLinks();

        // Show master link again
        if (urlDisplay) {
            urlDisplay.classList.remove('hidden');
            // If we have a slug, show the friendly URL, otherwise show current URL
            if (currentSlug) {
                const baseUrl = window.location.href.split('?')[0];
                generatedUrlSpan.textContent = `${baseUrl}?id=${currentSlug}`;
                // Add admin token if available in data
                if (data.adminToken) {
                    generatedUrlSpan.textContent += `&admin=${data.adminToken}`;
                }
            } else {
                generatedUrlSpan.textContent = window.location.href;
            }
        }
    }

    function showRevealView(data) {
        setupView.classList.remove('active');
        setupView.classList.add('hidden');
        adminView.classList.remove('active');
        adminView.classList.add('hidden');

        revealView.classList.add('active');
        revealView.classList.remove('hidden');

        // Ensure content is hidden initially
        revealContent.classList.add('hidden');
        giftBoxTrigger.style.display = 'flex'; // Restore gift box

        giverNameDisplay.textContent = data.g; // giver
        receiverNameDisplay.textContent = data.r; // receiver

        if (data.d) {
            const [year, month, day] = data.d.split('-');
            displayDate.textContent = `${day}/${month}/${year}`;
        } else {
            displayDate.textContent = "Data não definida";
        }

        if (data.v) {
            displayValue.textContent = `Max: R$ ${data.v}`;
        } else {
            displayValue.textContent = "Valor livre";
        }
    }
    function addParticipant() {
        const name = participantInput.value.trim();
        if (!name) return;

        if (participants.includes(name)) {
            showToast("Nome já adicionado!", "error");
            return;
        }

        participants.push(name);
        renderParticipants();
        participantInput.value = '';
        participantInput.focus();
        updateDrawButton();
    }

    function removeParticipant(name) {
        participants = participants.filter(p => p !== name);
        renderParticipants();
        updateDrawButton();
    }

    function renderParticipants() {
        participantsList.innerHTML = '';
        participants.forEach((name, index) => {
            const li = document.createElement('li');
            li.className = 'participant-item';
            li.innerHTML = `
                <span><span style="color: var(--text-muted); margin-right: 5px;">${index + 1}.</span> <strong>${name}</strong></span>
                <button class="remove-btn">
                    <i class="fas fa-times"></i>
                </button>
            `;
            li.querySelector('.remove-btn').addEventListener('click', () => removeParticipant(name));
            participantsList.appendChild(li);
        });
    }

    function updateDrawButton() {
        drawBtn.disabled = participants.length < 3;
        if (participants.length < 3) {
            drawBtn.textContent = `Mínimo 3 participantes (${participants.length}/3)`;
        } else {
            drawBtn.textContent = "Realizar Sorteio";
        }
    }

    function shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    function performDraw() {
        if (participants.length < 3) return;

        // Shuffle and pair
        let shuffled = [...participants];

        if (circleModeCheckbox.checked) {
            // Circle Mode: A -> B -> C -> A
            shuffleArray(shuffled);
            currentPairs = [];
            for (let i = 0; i < shuffled.length; i++) {
                let giver = shuffled[i];
                let receiver = shuffled[(i + 1) % shuffled.length];
                // Add Secret ID for secure linking
                currentPairs.push({
                    giver,
                    receiver,
                    secretId: generateSecretId()
                });
            }
        } else {
            // Random Mode (Standard)
            let receiverPool = [...participants];
            currentPairs = [];

            let isValid = false;
            let attempts = 0;

            while (!isValid && attempts < 100) {
                attempts++;
                shuffleArray(receiverPool);
                isValid = true;
                for (let i = 0; i < participants.length; i++) {
                    if (participants[i] === receiverPool[i]) {
                        isValid = false;
                        break;
                    }
                }
            }

            if (!isValid) {
                showToast("Não foi possível gerar um sorteio válido. Tente novamente.", "error");
                return;
            }

            for (let i = 0; i < participants.length; i++) {
                currentPairs.push({
                    giver: participants[i],
                    receiver: receiverPool[i],
                    secretId: generateSecretId()
                });
            }
        }

        renderResults();
        setupView.classList.remove('active');
        setupView.classList.add('hidden');
        adminView.classList.add('active');
        adminView.classList.remove('hidden');
        document.title = "Amigo Secreto - Sorteio Realizado";

        // Generate Master Link (and save to Supabase)
        generateMasterLink();
    }

    function renderResults() {
        resultsList.innerHTML = '';

        // Sort pairs based on the original participants order
        const sortedPairs = [...currentPairs].sort((a, b) => {
            return participants.indexOf(a.giver) - participants.indexOf(b.giver);
        });

        sortedPairs.forEach((pair, index) => {
            const li = document.createElement('li');
            li.className = 'result-item';

            li.innerHTML = `
                <div class="result-info" data-giver="${pair.giver}">
                    <strong><span style="color: var(--text-muted); margin-right: 5px;">${index + 1}.</span> ${pair.giver}</strong>
                    <small style="margin-top: 4px;">Pegou: ???</small>
                </div>
                <div class="result-actions">
                    <button class="action-btn btn-copy">
                        <i class="fas fa-copy"></i>
                    </button>
                    <button class="action-btn btn-whatsapp">
                        <i class="fab fa-whatsapp"></i>
                    </button>
                </div>
            `;
            resultsList.appendChild(li);
        });
    }

    // --- Friendly URL Helpers ---

    function generateSlug(text) {
        return text
            .toString()
            .normalize('NFD') // Split accents
            .replace(/[\u0300-\u036f]/g, '') // Remove accents
            .toLowerCase()
            .trim()
            .replace(/\s+/g, '-') // Replace spaces with -
            .replace(/[^\w\-]+/g, '') // Remove non-word chars
            .replace(/\-\-+/g, '-'); // Replace multiple - with single -
    }

    function generateSecretId() {
        // Generate a random 6-character string (alphanumeric)
        return Math.random().toString(36).substring(2, 8);
    }

    async function getUniqueSlug(baseName) {
        if (!supabase) return null;

        let slug = generateSlug(baseName);
        let isUnique = false;
        let counter = 1;
        let candidateSlug = slug;

        while (!isUnique && counter < 20) { // Limit attempts to avoid infinite loop
            const { data, error } = await supabase
                .from('draws')
                .select('slug')
                .eq('slug', candidateSlug)
                .maybeSingle();

            if (!data) {
                isUnique = true; // Slug not found, so it's unique
            } else {
                counter++;
                candidateSlug = `${slug}-${counter}`;
            }
        }
        return candidateSlug;
    }

    async function generateMasterLink() {
        if (!urlDisplay) return;

        const adminToken = generateSecretId(); // Reuse random string generator for admin token

        const masterData = {
            master: true,
            pairs: currentPairs,
            maxValue: maxValueInput.value,
            revealDate: revealDateInput.value,
            adminToken: adminToken // Save token in data
        };

        // Default to legacy encoding if Supabase is down
        let fullUrl = '';
        let slug = null;

        if (supabase && participants.length > 0) {
            // Generate Friendly Slug based on first participant
            const firstName = participants[0];
            slug = await getUniqueSlug(firstName);
        }

        if (slug) {
            // Use Friendly URL with Admin Token
            currentSlug = slug;
            const baseUrl = window.location.href.split('?')[0];
            fullUrl = `${baseUrl}?id=${slug}&admin=${adminToken}`;

            // Save full data to Supabase
            await saveToHistory(fullUrl, currentPairs.length, slug, masterData);
        } else {
            // Fallback to Legacy URL
            const encoded = encodeData(masterData);
            const baseUrl = window.location.href.split('?')[0];
            fullUrl = `${baseUrl}?data=${encoded}`;
            await saveToHistory(fullUrl, currentPairs.length, null, null);
        }

        // Show loading state or full URL first
        generatedUrlSpan.textContent = fullUrl;
        urlDisplay.classList.remove('hidden');

        // Automatically update the browser URL so it's saved in history
        window.history.pushState({ path: fullUrl }, '', fullUrl);

        // Update individual links now that we have the slug (or not)
        updateIndividualLinks();

        // Try to shorten the URL (optional)
        try {
            const shortUrl = await shortenUrl(fullUrl);
            if (shortUrl) {
                generatedUrlSpan.textContent = shortUrl;
            }
        } catch (error) {
            console.error("Failed to shorten URL:", error);
        }
    }


    function updateIndividualLinks() {
        const items = resultsList.querySelectorAll('.result-item');
        const maxValue = maxValueInput.value;
        const revealDate = revealDateInput.value;
        const baseUrl = window.location.href.split('?')[0]; // Clean URL

        items.forEach((item) => {
            const giverName = item.querySelector('.result-info').dataset.giver;
            const pair = currentPairs.find(p => p.giver === giverName);

            if (!pair) return;

            let link = '';

            if (currentSlug && pair.secretId) {
                // Secure Friendly Link: ?id=slug&u=secretId
                link = `${baseUrl}?id=${currentSlug}&u=${pair.secretId}`;
            } else if (currentSlug) {
                // Fallback for old draws without secretId (shouldn't happen for new ones)
                const userSlug = generateSlug(pair.giver);
                link = `${baseUrl}?id=${currentSlug}&u=${userSlug}`;
            } else {
                // Legacy Link: ?data=base64
                const pairData = {
                    g: pair.giver,
                    r: pair.receiver,
                    v: maxValue,
                    d: revealDate
                };
                const encodedData = encodeData(pairData);
                link = `${baseUrl}?data=${encodedData}`;
            }

            const copyBtn = item.querySelector('.btn-copy');
            const whatsappBtn = item.querySelector('.btn-whatsapp');

            // Remove old listeners (cloning is a quick way)
            const newCopyBtn = copyBtn.cloneNode(true);
            const newWhatsappBtn = whatsappBtn.cloneNode(true);
            copyBtn.parentNode.replaceChild(newCopyBtn, copyBtn);
            whatsappBtn.parentNode.replaceChild(newWhatsappBtn, whatsappBtn);

            newCopyBtn.onclick = () => {
                navigator.clipboard.writeText(link).then(() => showToast("Link copiado!"));
            };

            newWhatsappBtn.onclick = () => {
                const text = `Olá ${pair.giver}! Seu amigo secreto já foi sorteado. Veja quem você tirou aqui: ${link}`;
                window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
            };
        });
    }

    function verifyResults() {
        verificationList.innerHTML = '';
        let displayPairs = [...currentPairs];

        if (circleModeCheckbox.checked && displayPairs.length > 0) {
            const ordered = [];
            let current = displayPairs[0];
            ordered.push(current);

            for (let i = 1; i < displayPairs.length; i++) {
                const next = displayPairs.find(p => p.giver === current.receiver);
                if (next) {
                    ordered.push(next);
                    current = next;
                }
            }
            displayPairs = ordered;
        }

        // Create a consistent color map for participants
        const colorMap = new Map();
        const colors = ['text-color-0', 'text-color-1', 'text-color-2', 'text-color-3', 'text-color-4'];

        // Assign colors based on name hash/index from original list to ensure consistency
        participants.forEach((name, index) => {
            colorMap.set(name, colors[index % colors.length]);
        });

        displayPairs.forEach((pair) => {
            const li = document.createElement('li');
            li.className = 'verification-item';

            // Get consistent color for each person
            const giverColor = colorMap.get(pair.giver) || 'text-color-0';
            const receiverColor = colorMap.get(pair.receiver) || 'text-color-0';

            li.innerHTML = `
                <span class="${giverColor}"><strong>${pair.giver}</strong></span>
                <i class="fas fa-arrow-right verification-arrow"></i>
                <span class="${receiverColor}"><strong>${pair.receiver}</strong></span>
            `;
            verificationList.appendChild(li);
        });

        verifyModal.classList.add('active');
    }

    function resetApp() {
        participants = [];
        currentPairs = [];
        currentSlug = null;
        renderParticipants();
        participantInput.value = '';
        maxValueInput.value = '';
        revealDateInput.value = '';

        adminView.classList.remove('active');
        adminView.classList.add('hidden');
        setupView.classList.add('active');
        setupView.classList.remove('hidden');
        if (urlDisplay) urlDisplay.classList.add('hidden');

        const url = new URL(window.location.href);
        url.searchParams.delete('data');
        url.searchParams.delete('id');
        url.searchParams.delete('u');
        window.history.replaceState({}, '', url);
    }

    function showToast(msg, type = 'success') {
        toast.textContent = msg;
        if (type === 'error') {
            toast.style.background = '#f43f5e';
        } else if (type === 'info') {
            toast.style.background = '#3b82f6';
        } else {
            toast.style.background = '#10b981';
        }
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }

    function confettiEffect() {
        const colors = ['#8b5cf6', '#f43f5e', '#3b82f6', '#10b981', '#fbbf24'];

        for (let i = 0; i < 50; i++) {
            const confetti = document.createElement('div');
            confetti.style.position = 'fixed';
            confetti.style.left = Math.random() * 100 + 'vw';
            confetti.style.top = '-10px';
            confetti.style.width = '10px';
            confetti.style.height = '10px';
            confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
            confetti.style.zIndex = '1000';
            confetti.style.animation = `fall ${Math.random() * 3 + 2}s linear forwards`;
            document.body.appendChild(confetti);

            setTimeout(() => confetti.remove(), 5000);
        }

        if (!document.getElementById('confetti-style')) {
            const style = document.createElement('style');
            style.id = 'confetti-style';
            style.innerHTML = `
                @keyframes fall {
                    to { transform: translateY(100vh) rotate(720deg); }
                }
            `;
            document.head.appendChild(style);
        }
    }

    // Helper for encoding/decoding data
    function encodeData(obj) {
        const str = JSON.stringify(obj);
        // Use Base64 for simple encoding (not encryption, but hides text)
        return btoa(encodeURIComponent(str));
    }

    function decodeData(str) {
        const decodedStr = decodeURIComponent(atob(str));
        return JSON.parse(decodedStr);
    }
});
