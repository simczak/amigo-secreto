document.addEventListener('DOMContentLoaded', () => {
    // State
    let participants = [];

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

    const giftBoxTrigger = document.getElementById('gift-box-trigger');
    const revealContent = document.getElementById('reveal-content');
    const giverNameDisplay = document.getElementById('giver-name');
    const receiverNameDisplay = document.getElementById('receiver-name');
    const displayDate = document.getElementById('display-date');
    const displayValue = document.getElementById('display-value');

    const toast = document.getElementById('toast');

    // --- Initialization ---
    checkUrlForReveal();

    // --- Event Listeners ---
    addBtn.addEventListener('click', addParticipant);
    participantInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addParticipant();
    });

    drawBtn.addEventListener('click', performDraw);
    resetBtn.addEventListener('click', resetApp);

    giftBoxTrigger.addEventListener('click', () => {
        giftBoxTrigger.style.display = 'none';
        revealContent.classList.remove('hidden');
        confettiEffect();
    });

    // --- Core Functions ---

    function checkUrlForReveal() {
        const urlParams = new URLSearchParams(window.location.search);
        const data = urlParams.get('data');

        if (data) {
            try {
                const decoded = decodeData(data);
                showRevealView(decoded);
            } catch (e) {
                console.error("Invalid data", e);
                // Fallback to setup if data is corrupted
                showSetupView();
            }
        } else {
            showSetupView();
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

    function showRevealView(data) {
        setupView.classList.remove('active');
        setupView.classList.add('hidden');

        revealView.classList.add('active');
        revealView.classList.remove('hidden');

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
        participants.forEach(name => {
            const li = document.createElement('li');
            li.className = 'participant-item';
            li.innerHTML = `
                <span>${name}</span>
                <button class="remove-btn" onclick="removeParticipant('${name}')">
                    <i class="fas fa-times"></i>
                </button>
            `;
            // Bind click event for remove button dynamically or use global delegation. 
            // For simplicity in this scope, we'll use the onclick attribute hack or better:
            li.querySelector('.remove-btn').onclick = () => removeParticipant(name);
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

        const isCircleMode = circleModeCheckbox.checked;
        let pairs = [];

        if (isCircleMode) {
            pairs = drawCircleMode([...participants]);
        } else {
            pairs = drawStandardMode([...participants]);
        }

        renderResults(pairs);

        setupView.classList.remove('active');
        setupView.classList.add('hidden');
        adminView.classList.add('active');
        adminView.classList.remove('hidden');
    }

    // Standard Derangement (Nobody picks themselves)
    function drawStandardMode(names) {
        let shuffled;
        let isValid = false;

        // Simple rejection sampling for derangement
        // For small N this is fast enough.
        while (!isValid) {
            shuffled = [...names].sort(() => Math.random() - 0.5);
            isValid = true;
            for (let i = 0; i < names.length; i++) {
                if (names[i] === shuffled[i]) {
                    isValid = false;
                    break;
                }
            }

            // Check for sub-loops? The user asked for "Circle Mode" to avoid sub-loops.
            // Standard mode allows sub-loops (A->B, B->A).
        }

        return names.map((giver, i) => ({
            giver,
            receiver: shuffled[i]
        }));
    }

    // Hamiltonian Cycle (A->B->C->...->A)
    function drawCircleMode(names) {
        const shuffled = [...names].sort(() => Math.random() - 0.5);
        const pairs = [];

        for (let i = 0; i < shuffled.length; i++) {
            const giver = shuffled[i];
            const receiver = shuffled[(i + 1) % shuffled.length];
            pairs.push({ giver, receiver });
        }

        return pairs;
    }

    function renderResults(pairs) {
        resultsList.innerHTML = '';
        const maxValue = maxValueInput.value;
        const revealDate = revealDateInput.value;

        pairs.forEach(pair => {
            const link = generateLink(pair.giver, pair.receiver, maxValue, revealDate);
            const li = document.createElement('li');
            li.className = 'result-item';
            li.innerHTML = `
                <div class="result-info">
                    <strong>${pair.giver}</strong>
                    <small>Pegou: ???</small>
                </div>
                <div class="result-actions">
                    <button class="action-btn btn-copy" title="Copiar Link">
                        <i class="fas fa-copy"></i>
                    </button>
                    <button class="action-btn btn-whatsapp" title="Enviar no WhatsApp">
                        <i class="fab fa-whatsapp"></i>
                    </button>
                </div>
            `;

            const copyBtn = li.querySelector('.btn-copy');
            const waBtn = li.querySelector('.btn-whatsapp');

            copyBtn.onclick = () => {
                navigator.clipboard.writeText(link).then(() => showToast("Link copiado!"));
            };

            waBtn.onclick = () => {
                const msg = `Olá ${pair.giver}! Aqui está o link para ver quem você tirou no Amigo Secreto: ${link}`;
                const waUrl = `https://wa.me/?text=${encodeURIComponent(msg)}`;
                window.open(waUrl, '_blank');
            };

            resultsList.appendChild(li);
        });
    }
    revealDateInput.value = '';

    adminView.classList.remove('active');
    adminView.classList.add('hidden');
    setupView.classList.add('active');
    setupView.classList.remove('hidden');

    // Clear URL params
    const url = new URL(window.location.href);
    url.searchParams.delete('data');
    window.history.replaceState({}, '', url);
}

        function showToast(msg, type = 'success') {
        toast.textContent = msg;
        toast.style.background = type === 'error' ? '#f43f5e' : '#10b981';
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }

        function confettiEffect() {
        // Simple confetti using canvas or DOM? 
        // Let's use a simple CSS/DOM approach for lightweight effect
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

        // Add keyframes dynamically if not present
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
    });
