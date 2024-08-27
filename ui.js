
// Set global variable for hovered decoration
window.currentHoveredDecoration = null;

// Function to set a cookie
window.setCookie = function(name, value, days) {
    const expires = new Date(Date.now() + days * 86400000).toUTCString();
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/`;
}

// Function to get a cookie
window.getCookie = function(name) {
    const cookieArr = document.cookie.split("; ");
    for (let cookie of cookieArr) {
        const [cookieName, cookieValue] = cookie.split("=");
        if (cookieName === name) {
            return decodeURIComponent(cookieValue);
        }
    }
    return null;
}

// Function to delete a cookie
window.deleteCookie = function(name) {
    setCookie(name, "", -1);
}

// Function to display information in the footer
window.updateFooter = function(decoration) {
    const footer = document.getElementById('footer');
    if (decoration) {
        const isUnlocked = unlockedDecorationIds.has(decoration.id);
        const count = isUnlocked ? unlockedDecorationIds.get(decoration.id) : 0;

        const imgUrl = decoration.icon;
        const name = decoration.name;
        const description = decoration.description || "No description available.";
        const categoryBadges = decoration.categories
            .map(id => `<span class="badge">${categories[id]?.name || 'Unknown'}</span>`)
            .join(' ');

        let metaText = `<div class="badge-container">${categoryBadges}</div>`;

        if (unlockedDecorationIds.size > 0) {
            metaText += `<div class="muted">Available: ` + (count ? `${count}` : `0`) + `</div>`;
        }

        footer.innerHTML = `
            <div class="footer-content">
                <img src="${imgUrl}" class="footer-img" title="ID: ${decoration.id}">
                <div class="footer-info">
                    <div class="footer-name">${name}</div>
                    <div class="footer-description">${description}</div>
                    ${metaText}
                </div>
            </div>
        `;
    } else {
        footer.innerHTML = '';
    }
}

// Function to handle hover over a decoration
window.handleHoverDecoration = function(decoration, img) {
    if (window.currentHoveredDecoration && window.currentHoveredDecoration.id !== decoration.id) {
        const prevImg = document.querySelector(`.icon[data-id='${window.currentHoveredDecoration.id}']`);
        if (prevImg) {
            prevImg.classList.remove('orange-border');
            prevImg.classList.add(getBorderClass(window.currentHoveredDecoration));
        }
    }

    img.classList.add('orange-border');
    window.currentHoveredDecoration = decoration;
    updateFooter(decoration);

    // Set tooltip for the ID
    img.setAttribute('title', `ID: ${decoration.id}`);
}

// Function to get the border class based on the decoration state
window.getBorderClass = function(decoration) {
    if (unlockedDecorationIds.has(decoration.id)) {
        return 'unlocked';
    }
}

// Modified displayIcon function to include hover event listener
window.displayIcon = function(iconUrl, decoration) {
    const img = document.createElement('img');
    img.src = iconUrl;
    img.className = `icon ${getBorderClass(decoration)}`;
    img.dataset.id = decoration.id;

    img.addEventListener('mouseover', () => handleHoverDecoration(decoration, img));

    document.getElementById('iconContainer').appendChild(img);
}

// Function to update the dropdown with correct category counts
window.updateCategoryDropdown = function() {
    const dropdown = document.getElementById('categoryDropdown');
    dropdown.innerHTML = ''; // Clear existing options

    // Add "All" option
    const allOption = document.createElement('option');
    allOption.value = 'all';
    allOption.textContent = `All (${decorations.length})`;
    dropdown.appendChild(allOption);

    // Add categories with correct counts
    for (const id in categories) {
        const categoryData = categories[id];
        const count = decorations.filter(deco => deco.categories && deco.categories.includes(parseInt(id))).length;
        const option = document.createElement('option');
        option.value = id;
        option.textContent = `${categoryData.name} (${count})`;
        dropdown.appendChild(option);
    }
}

// Function to display decorations based on selected category
window.displayDecorations = function(categoryId) {
    const container = document.getElementById('iconContainer');
    container.innerHTML = ''; // Clear existing icons

    let filteredDecorations = categoryId === 'all'
        ? decorations
        : decorations.filter(deco => deco.categories && deco.categories.includes(parseInt(categoryId)));

    // Sort decorations by their name
    filteredDecorations = filteredDecorations.sort((a, b) => a.name.localeCompare(b.name));

    filteredDecorations.forEach(decoration => {
        displayIcon(decoration.icon, decoration);
    });
}

// Function to reevaluate and update all items on the page
window.reevaluateDecorations = function() {
    const categoryId = document.getElementById('categoryDropdown').value;
    const filteredDecorations = categoryId === 'all'
        ? decorations
        : decorations.filter(deco => deco.categories && deco.categories.includes(parseInt(categoryId)));

    displayDecorations(categoryId);
}
