// Set global variables
window.currentHoveredDecoration = null;
window.currentClickedDecoration = null;
window.isFooterLocked = false; // To track whether the footer is locked by a click

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

// Function to update the footer
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

        const encodedName = encodeURIComponent(decoration.name + ' (Handiwork)');
        const url = `https://wiki.guildwars2.com/index.php?search=${encodedName}`;
        footer.innerHTML = `
            <div class="footer-content">
                <img src="${imgUrl}" class="footer-img" title="ID: ${decoration.id}">
                <div class="footer-info">
                    <div class="footer-name">${name} <a href="${url}" title="Wiki">&#9881;</a></div>
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
    if (!window.isFooterLocked) {
        updateFooter(decoration);
    }

    if (window.currentHoveredDecoration && window.currentHoveredDecoration.id !== decoration.id) {
        const prevImg = document.querySelector(`.icon[data-id='${window.currentHoveredDecoration.id}']`);
        if (prevImg) {
            prevImg.classList.remove('orange-border');
            if (window.currentHoveredDecoration !== window.currentClickedDecoration) {
                prevImg.classList.add(getBorderClass(window.currentHoveredDecoration));
            }
        }
    }

    if (window.currentClickedDecoration && window.currentClickedDecoration.id !== decoration.id) {
        const clickedImg = document.querySelector(`.icon[data-id='${window.currentClickedDecoration.id}']`);
        if (clickedImg) {
            clickedImg.classList.remove('orange-border');
            clickedImg.classList.add('gold-border');
        }
    }

    img.classList.add('orange-border');
    window.currentHoveredDecoration = decoration;
}

// Function to handle click on a decoration
window.handleClickDecoration = function(decoration, img) {
    if (window.currentClickedDecoration && window.currentClickedDecoration.id !== decoration.id) {
        const prevImg = document.querySelector(`.icon[data-id='${window.currentClickedDecoration.id}']`);
        if (prevImg) {
            prevImg.classList.remove('gold-border');
            prevImg.classList.add(getBorderClass(window.currentClickedDecoration));
        }
    }

    if (window.currentClickedDecoration && window.currentClickedDecoration.id === decoration.id) {
        // If the same item is clicked again, unlock the footer and reset the clicked decoration
        window.isFooterLocked = false;
        window.currentClickedDecoration = null;
        img.classList.remove('gold-border');
        img.classList.add('orange-border'); // Reapply orange border on hover
    } else {
        // If a new item is clicked, lock the footer and update it with the clicked decoration
        window.isFooterLocked = true;
        window.currentClickedDecoration = decoration;
        img.classList.remove('orange-border');
        img.classList.add('gold-border');
        updateFooter(decoration);
    }
}

// Function to get the border class based on the decoration state
window.getBorderClass = function(decoration) {
    if (unlockedDecorationIds.has(decoration.id)) {
        return 'unlocked';
    }
}

// Modified displayIcon function to include hover and click event listeners
window.displayIcon = function(iconUrl, decoration) {
    const img = document.createElement('img');
    img.src = iconUrl;
    img.className = `icon ${getBorderClass(decoration)}`;
    img.dataset.id = decoration.id;

    img.addEventListener('mouseover', () => handleHoverDecoration(decoration, img));
    img.addEventListener('mouseout', () => {
        if (window.currentClickedDecoration !== decoration) {
            img.classList.remove('orange-border');
            img.classList.add(getBorderClass(decoration));
        }
    });
    img.addEventListener('click', () => handleClickDecoration(decoration, img));

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