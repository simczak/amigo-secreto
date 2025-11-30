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
    let restrictions = new Map(); // Map<string, Set<string>>

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
    let toastTimeout = null; // Track toast timeout to prevent overlapping

    // New Elements for URL Display
    const urlDisplay = document.getElementById('url-display');
    const generatedUrlSpan = document.getElementById('generated-url');
    const copyUrlBtn = document.getElementById('copy-url-btn');

    // Restrictions Modal Elements
    const restrictionsModal = document.getElementById('restrictions-modal');
    const restrictionsList = document.getElementById('restrictions-list');
    const saveRestrictionsBtn = document.getElementById('save-restrictions-btn');
    const restrictionGiverName = document.getElementById('restriction-giver-name');
    let currentRestrictionGiver = null;

    const redrawBtn = document.getElementById('redraw-btn');
    let wasRedrawn = false;

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

    closeModalBtn.addEventListener('click', () => {
        verifyModal.classList.remove('active');
        if (wasRedrawn) {
            showToast("Links atualizados com o novo sorteio!", "success");
            wasRedrawn = false;
        }
    });

    if (redrawBtn) {
        redrawBtn.addEventListener('click', redraw);
    }

    if (saveRestrictionsBtn) {
        saveRestrictionsBtn.addEventListener('click', saveRestrictions);
    }

    giftBoxTrigger.addEventListener('click', () => {
        giftBoxTrigger.style.display = 'none';
        revealContent.classList.remove('hidden');
        confettiEffect();
    });

    if (copyUrlBtn) {
        copyUrlBtn.addEventListener('click', () => {
            const url = generatedUrlSpan.textContent;
            if (url && url !== '...') {
                navigator.clipboard.writeText(url).then(() => {
                    showToast("Link copiado!", "success", copyUrlBtn);
                    copyUrlBtn.classList.add('copied');
                    setTimeout(() => copyUrlBtn.classList.remove('copied'), 600);
                });
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

        const loadingView = document.getElementById('loading-view');

        // Helper to switch views
        const showView = (viewId) => {
            loadingView.classList.remove('active');
            loadingView.style.display = 'none'; // Ensure it's hidden

            if (viewId === 'setup-view') {
                setupView.classList.add('active');
            } else if (viewId === 'admin-view') {
                adminView.classList.remove('hidden');
                adminView.classList.add('active'); // Ensure active class if used
            } else if (viewId === 'reveal-view') {
                revealView.classList.remove('hidden');
            }
        };

        // If no parameters, go straight to setup
        if (!dataParam && !idParam) {
            showView('setup-view');
            return;
        }

        // Case 1: Legacy URL (base64 data)
        if (dataParam) {
            try {
                const decoded = decodeData(dataParam);
                if (decoded.master) {
                    restoreAdminView(decoded);
                    showView('admin-view');
                } else {
                    showRevealView(decoded);
                    showView('reveal-view');
                }
            } catch (e) {
                console.error("Invalid legacy data", e);
                showToast("Link inválido ou corrompido.");
                showView('setup-view');
            }
            return;
        }

        // Case 2: Friendly URL (Supabase)
        if (idParam) {
            if (!supabase) {
                showToast("Erro de conexão com o banco de dados.");
                showView('setup-view');
                return;
            }

            try {
                // Fetch draw data
                const { data: draw, error } = await supabase
                    .from('draws')
                    .select('*')
                    .eq('slug', idParam)
                    .single();

                if (error || !draw) {
                    console.error("Draw not found", error);
                    showToast("Sorteio não encontrado.");
                    showView('setup-view');
                    return;
                }

                currentPairs = draw.draw_data.pairs;
                participants = currentPairs.map(p => p.giver);
                currentSlug = draw.slug;

                // Restore settings
                if (draw.draw_data.maxValue) maxValueInput.value = draw.draw_data.maxValue;
                if (draw.draw_data.revealDate) revealDateInput.value = draw.draw_data.revealDate;

                if (adminParam) {
                    // Admin View
                    if (adminParam === draw.draw_data.adminToken) {
                        renderResults();
                        generateMasterLink(); // Regenerate link display
                        showView('admin-view');
                    } else {
                        showToast("Acesso negado. Token inválido.");
                        showView('setup-view');
                    }
                } else if (userParam) {
                    // Reveal View
                    // Check if userParam matches a secretId or a slug (legacy fallback)
                    const pair = currentPairs.find(p => p.secretId === userParam || GameLogic.generateSlug(p.giver) === userParam);

                    if (pair) {
                        const revealData = {
                            g: pair.giver,
                            r: pair.receiver,
                            v: draw.draw_data.maxValue,
                            d: draw.draw_data.revealDate
                        };
                        showRevealView(revealData);
                        showView('reveal-view');
                    } else {
                        showToast("Participante não encontrado neste sorteio.");
                        showView('setup-view');
                    }
                } else {
                    // No user param, maybe show a generic "Enter your code" screen?
                    // For now, redirect to setup
                    showView('setup-view');
                }

            } catch (e) {
                console.error("Error fetching draw", e);
                showToast("Erro ao carregar sorteio.");
                showView('setup-view');
            }
        }
    }






    // ... (rest of functions) ...



    function openRestrictionsModal(giverName) {
        currentRestrictionGiver = giverName;
        restrictionGiverName.textContent = giverName;
        restrictionsList.innerHTML = '';

        const currentRestricted = restrictions.get(giverName) || new Set();

        participants.forEach(p => {
            if (p === giverName) return; // Can't restrict self

            const li = document.createElement('li');
            li.className = 'participant-item';
            li.style.cursor = 'pointer';

            const isChecked = currentRestricted.has(p) ? 'checked' : '';

            li.innerHTML = `
                <label style="display: flex; align-items: center; width: 100%; cursor: pointer; padding: 5px 0;">
                    <input type="checkbox" value="${p}" ${isChecked} style="margin-right: 10px; width: 20px; height: 20px; accent-color: var(--primary-color);">
                    <span>${p}</span>
                </label>
            `;
            restrictionsList.appendChild(li);
        });

        restrictionsModal.classList.add('active');
    }

    function saveRestrictions() {
        if (!currentRestrictionGiver) return;

        const checkboxes = restrictionsList.querySelectorAll('input[type="checkbox"]');
        const restrictedSet = new Set();

        checkboxes.forEach(cb => {
            if (cb.checked) {
                restrictedSet.add(cb.value);
            }
        });

        if (restrictedSet.size > 0) {
            restrictions.set(currentRestrictionGiver, restrictedSet);
        } else {
            restrictions.delete(currentRestrictionGiver);
        }

        restrictionsModal.classList.remove('active');
        renderParticipants();
    }

    function redraw() {
        if (participants.length < 3) return;

        // Use GameLogic to perform the draw
        const restrictionsObj = {};
        restrictions.forEach((set, key) => {
            restrictionsObj[key] = Array.from(set);
        });

        const result = GameLogic.performDrawLogic(participants, circleModeCheckbox.checked, restrictionsObj);

        if (!result.success) {
            showToast(result.error, "error");
            return;
        }

        currentPairs = result.pairs;
        wasRedrawn = true;

        // Update UI
        renderResults();

        // Update Verification List in Modal
        const verificationList = document.getElementById('verification-list');
        if (verificationList) {
            verificationList.innerHTML = '';
            // Sort pairs based on the original participants order
            const sortedPairs = [...currentPairs].sort((a, b) => {
                return participants.indexOf(a.giver) - participants.indexOf(b.giver);
            });

            sortedPairs.forEach((pair, index) => {
                const li = document.createElement('li');
                li.className = 'verification-item';

                // Cycling colors for visual distinction
                const colorClass = `text-color-${index % 5}`;

                li.innerHTML = `
                    <span class="${colorClass}"><strong>${pair.giver}</strong></span>
                    <i class="fas fa-arrow-right verification-arrow"></i>
                    <span class="${colorClass}"><strong>${pair.receiver}</strong></span>
                `;
                verificationList.appendChild(li);
            });
        }

        // Save new results to Supabase (updates the existing slug if possible, or creates new)
        generateMasterLink();

        showToast("Sorteio refeito com sucesso!", "success");
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

            // Check if has restrictions to show indicator
            const hasRestrictions = restrictions.has(name) && restrictions.get(name).size > 0;
            const restrictionClass = hasRestrictions ? 'text-danger' : 'text-muted';
            const restrictionIcon = hasRestrictions ? 'fa-ban' : 'fa-ban'; // Can change icon if needed

            li.innerHTML = `
                <div style="display: flex; flex-direction: column; flex: 1;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span style="color: var(--text-muted); font-size: 0.9em;">${index + 1}.</span>
                        <strong>${name}</strong>
                    </div>
                    ${hasRestrictions ? `<small style="color: var(--accent-color); margin-left: 25px; font-size: 0.8em;">🚫 Não tira: ${Array.from(restrictions.get(name)).join(', ')}</small>` : ''}
                </div>
                <div class="action-buttons" style="display: flex; gap: 5px;">
                    <button class="btn-icon restriction-btn" title="Restrições (Quem não pode tirar)">
                        <i class="fas ${restrictionIcon} ${restrictionClass}"></i>
                    </button>
                    <button class="btn-icon remove-btn" title="Remover">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `;
            li.querySelector('.restriction-btn').addEventListener('click', () => openRestrictionsModal(name));
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



    function performDraw() {
        if (participants.length < 3) return;

        // Use GameLogic to perform the draw
        const restrictionsObj = {};
        restrictions.forEach((set, key) => {
            restrictionsObj[key] = Array.from(set);
        });

        const result = GameLogic.performDrawLogic(participants, circleModeCheckbox.checked, restrictionsObj);

        if (!result.success) {
            showToast(result.error, "error");
            return;
        }

        currentPairs = result.pairs;

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

    async function getUniqueSlug(baseName) {
        if (!supabase) return null;

        let slug = GameLogic.generateSlug(baseName);
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

        const adminToken = GameLogic.generateSecretId(); // Reuse random string generator for admin token

        const masterData = {
            master: true,
            pairs: currentPairs,
            maxValue: maxValueInput.value,
            revealDate: revealDateInput.value,
            adminToken: adminToken // Save token in data
        };

        // --- UI UPDATE: Show Loading State Immediately ---
        const urlLoading = document.getElementById('url-loading');
        const urlContent = document.getElementById('url-content');

        urlDisplay.classList.remove('hidden');
        if (urlLoading) urlLoading.classList.remove('hidden');
        if (urlContent) urlContent.classList.add('hidden');
        generatedUrlSpan.textContent = '...';
        // -------------------------------------------------

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

        // --- UI UPDATE: Show Result ---
        generatedUrlSpan.textContent = fullUrl;
        if (urlLoading) urlLoading.classList.add('hidden');
        if (urlContent) urlContent.classList.remove('hidden');
        // ------------------------------

        // Automatically update the browser URL so it's saved in history
        window.history.pushState({ path: fullUrl }, '', fullUrl);

        // Update individual links now that we have the slug (or not)
        updateIndividualLinks();

        // Update Copy Button for Admin Link
        if (copyUrlBtn) {
            // Remove old listeners to avoid duplicates (simple clone replacement)
            const newCopyBtn = copyUrlBtn.cloneNode(true);
            copyUrlBtn.parentNode.replaceChild(newCopyBtn, copyUrlBtn);

            newCopyBtn.addEventListener('click', () => {
                const url = generatedUrlSpan.textContent;
                if (url && url !== '...') {
                    navigator.clipboard.writeText(url).then(() => {
                        showToast("Copiado, não compartilhe esse link, pois ele revela todo o resultado do sorteio.", "warning", newCopyBtn, 4000);
                        newCopyBtn.classList.add('copied');
                        setTimeout(() => newCopyBtn.classList.remove('copied'), 600);
                    });
                }
            });
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
                const userSlug = GameLogic.generateSlug(pair.giver);
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

            // Add test hook
            newCopyBtn.setAttribute('data-test-link', link);

            copyBtn.parentNode.replaceChild(newCopyBtn, copyBtn);
            whatsappBtn.parentNode.replaceChild(newWhatsappBtn, whatsappBtn);

            newCopyBtn.onclick = () => {
                navigator.clipboard.writeText(link).then(() => {
                    showToast("Link copiado!", "success", newCopyBtn);
                    newCopyBtn.classList.add('copied');
                    setTimeout(() => newCopyBtn.classList.remove('copied'), 600);
                });
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

    function showToast(msg, type = 'success', targetEl = null, duration = 2000) {
        // Clear any existing timeout to prevent overlapping toasts
        if (toastTimeout) {
            clearTimeout(toastTimeout);
            toast.classList.remove('show', 'hide');
        }

        toast.textContent = msg;
        toast.className = 'toast show';

        if (type === 'error') {
            toast.classList.add('error');
        } else if (type === 'warning') {
            toast.classList.add('warning'); // Add warning class support if needed, or just default style
            // Ensure warning style is handled in CSS if 'warning' class is used, 
            // otherwise it might just default. For now, let's assume 'success' or 'error' are main ones,
            // but since we passed 'warning' in the previous step, we should handle it or map it.
            // Let's just keep the class add logic simple.
        } else {
            toast.classList.add('success');
        }

        if (targetEl) {
            const rect = targetEl.getBoundingClientRect();

            // Position above the button using viewport coordinates (fixed positioning)
            const topPos = Math.max(10, rect.top - 60);

            toast.style.position = 'fixed';
            toast.style.top = topPos + 'px';
            toast.style.left = (rect.left + (rect.width / 2)) + 'px';
            toast.style.bottom = 'auto';
        } else {
            // Fallback to center bottom
            toast.style.position = 'fixed';
            toast.style.left = '50%';
            toast.style.bottom = '30px';
            toast.style.top = 'auto';
        }

        // Hide toast after duration with slide-out animation
        toastTimeout = setTimeout(() => {
            toast.classList.add('hide');
            setTimeout(() => {
                toast.classList.remove('show', 'hide');
                toastTimeout = null;
            }, 300); // Match animation duration
        }, duration);
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
