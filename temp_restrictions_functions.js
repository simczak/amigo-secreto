
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
