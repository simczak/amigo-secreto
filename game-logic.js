(function (exports) {
    // --- Core Logic ---

    function shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    function generateSecretId() {
        return Math.random().toString(36).substring(2, 8);
    }

    function generateSlug(text) {
        return text
            .toString()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim()
            .replace(/\s+/g, '-')
            .replace(/[^\w-]+/g, '')
            .replace(/--+/g, '-');
    }

    function performDrawLogic(participants, isCircleMode, restrictions = {}) {
        if (participants.length < 3) return { success: false, error: "Mínimo 3 participantes" };

        let pairs = [];
        let shuffled = [...participants];

        if (isCircleMode) {
            // Circle Mode: A -> B -> C -> A
            // Note: Restrictions are harder to implement in Circle Mode without complex graph theory.
            // For now, we will just shuffle and check if it's valid, retrying if needed.

            let isValid = false;
            let attempts = 0;

            while (!isValid && attempts < 1000) {
                attempts++;
                shuffleArray(shuffled);
                isValid = true;

                for (let i = 0; i < shuffled.length; i++) {
                    let giver = shuffled[i];
                    let receiver = shuffled[(i + 1) % shuffled.length];

                    // Check restriction
                    if (restrictions[giver] && restrictions[giver].includes(receiver)) {
                        isValid = false;
                        break;
                    }
                }
            }

            if (!isValid) {
                return { success: false, error: "Não foi possível gerar um sorteio válido com essas restrições no modo Círculo. Tente o modo Aleatório ou remova algumas restrições." };
            }

            for (let i = 0; i < shuffled.length; i++) {
                let giver = shuffled[i];
                let receiver = shuffled[(i + 1) % shuffled.length];
                pairs.push({
                    giver,
                    receiver,
                    secretId: generateSecretId()
                });
            }

        } else {
            // Random Mode
            let receiverPool = [...participants];
            let isValid = false;
            let attempts = 0;

            while (!isValid && attempts < 1000) {
                attempts++;
                shuffleArray(receiverPool);
                isValid = true;
                for (let i = 0; i < participants.length; i++) {
                    const giver = participants[i];
                    const receiver = receiverPool[i];

                    // Self-draw check
                    if (giver === receiver) {
                        isValid = false;
                        break;
                    }

                    // Restriction check
                    if (restrictions[giver] && restrictions[giver].includes(receiver)) {
                        isValid = false;
                        break;
                    }
                }
            }

            if (!isValid) {
                return { success: false, error: "Não foi possível gerar um sorteio válido com essas restrições. Tente remover algumas." };
            }

            for (let i = 0; i < participants.length; i++) {
                pairs.push({
                    giver: participants[i],
                    receiver: receiverPool[i],
                    secretId: generateSecretId()
                });
            }
        }

        return { success: true, pairs: pairs };
    }

    // Export functions
    exports.shuffleArray = shuffleArray;
    exports.generateSecretId = generateSecretId;
    exports.generateSlug = generateSlug;
    exports.performDrawLogic = performDrawLogic;

})(typeof exports === 'undefined' ? (window.GameLogic = {}) : exports);
