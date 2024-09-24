// Set global variables
window.currentHoveredDecoration = null;

// Function to update the footer
function updateFooter(decoration) {
    const footer = document.getElementById('footer');
    if (decoration) {
        const isUnlocked = unlockedDecorationIds.has(decoration.id);
        const count = isUnlocked ? unlockedDecorationIds.get(decoration.id) : 0;

        const imgUrl = decoration.icon;
        const name = decoration.name;
        const description = decoration.description || "No description available.";
        const categoryBadges = decoration.categories
            .map(id => {
                const matchedCategory = categories.find(category => category.id === id);
                return `<span class="badge">${matchedCategory ? matchedCategory.name : 'Unknown'}</span>`;
            })
            .join(' ');

        let metaText = `<div class="badge-container">${categoryBadges}</div>`;
        if (unlockedDecorationIds.size > 0) {
            metaText += `<div class="muted">Available: ` + (count ? `${count}` : `0`) + `</div>`;
        }

        const wikiUrl = decoration.wikiTitle ? `https://wiki.guildwars2.com/index.php?search=${encodeURIComponent(decoration.wikiTitle)}` : '';

        footer.innerHTML = `
            <div class="footer-content">
                <div class="footer-name">${name}
                    ${wikiUrl ? `<a class="wiki-link" href="${wikiUrl}" title="Wiki">(wiki)</a>` : ''}
                </div>
                <div class="footer-info">
                    ${metaText}
                </div>
            </div>
        `;

        // Add event listener for thumbnail click
        const thumbnailImg = footer.querySelector('.footer-preview');
        if (thumbnailImg && decoration.original) {
            thumbnailImg.addEventListener('click', () => {
                showModal(decoration.original);
            });
        }
    } else {
        footer.innerHTML = '';
    }
}

function showModal(decoration) {
    const modal = document.getElementById('imageModal');
    const modalImg = document.getElementById('modalImage');

    modal.style.display = "block";
    modalImg.src = decoration.original?.source ?? "https://static.staticwars.com/quaggans/lost.jpg";

    // Close the modal when the user clicks on <span> (x)
    const span = document.getElementsByClassName("close")[0];
    span.onclick = function() {
        modal.style.display = "none";
    }

    // Close the modal when the user clicks anywhere outside of the modal image
    window.onclick = function(event) {
        if (event.target === modal) {
            modal.style.display = "none";
        }
    }
}

// Function to handle hover over a decoration
function handleHoverDecoration(decoration, img) {
    updateFooter(decoration);

    if (window.currentHoveredDecoration && window.currentHoveredDecoration.id !== decoration.id) {
        const prevImg = document.querySelector(`.icon[data-id='${window.currentHoveredDecoration.id}']`);
        if (prevImg) {
            prevImg.classList.remove('orange-border');
        }
    }

    img.classList.add('orange-border');
    window.currentHoveredDecoration = decoration;
}

// Function to handle click on a decoration
function handleClickDecoration(decoration) {
    showModal(decoration);
}

// Modified displayIcon function to include hover and click event listeners
function displayIcon(iconUrl, decoration) {
    const img = document.createElement('div');
    img.style.backgroundImage = `url(${iconUrl})`;
    img.className = "icon";
    img.dataset.id = decoration.id;

    img.addEventListener('mouseover', () => handleHoverDecoration(decoration, img));
    img.addEventListener('click', () => handleClickDecoration(decoration));

    document.getElementById('iconContainer').appendChild(img);
}

// Function to display decorations based on selected category
function displayDecorations(categoryId) {
    const container = document.getElementById('iconContainer');
    container.innerHTML = ''; // Clear existing icons

    let filteredDecorations = categoryId === 'all'
        ? decorations
        : decorations.filter(deco => deco.categories && deco.categories.includes(parseInt(categoryId)));

    const query = document.getElementById('searchInput').value;
    if (query) {
        filteredDecorations = filteredDecorations.filter(deco =>
            deco.name.toLowerCase().includes(query.toLowerCase())
        );
    }

    // Sort decorations by their name
    filteredDecorations = filteredDecorations.sort((a, b) => a.name.localeCompare(b.name));
    if (filteredDecorations.length > 0) {
        // Display the filtered decorations
        filteredDecorations.forEach(decoration => {
            displayIcon(decoration.icon, decoration);
        });
    } else {
        container.innerHTML = '<p class="no-results">No decorations found.</p>';
    }
}

// Function to reevaluate and update all items on the page
function reevaluateDecorations() {
    const categoryId = document.getElementById('categoryDropdown').value;
    const filteredDecorations = categoryId === 'all'
        ? decorations
        : decorations.filter(deco => deco.categories && deco.categories.includes(parseInt(categoryId)));

    displayDecorations(categoryId);
}

// Function to filter and display decorations based on search input
function searchDecorations(query) {
    const container = document.getElementById('iconContainer');
    container.innerHTML = ''; // Clear existing icons

    const categoryId = document.getElementById('categoryDropdown').value;
    let filteredDecorations = decorations;

    // Filter by category if not "all"
    if (categoryId !== 'all') {
        filteredDecorations = filteredDecorations.filter(deco =>
            deco.categories && deco.categories.includes(parseInt(categoryId))
        );
    }

    // Filter by search query
    filteredDecorations = filteredDecorations.filter(deco =>
        deco.name.toLowerCase().includes(query.toLowerCase())
    );

    // Sort decorations by their name
    const sortedDecorations = filteredDecorations.sort((a, b) => a.name.localeCompare(b.name));

    sortedDecorations.forEach(decoration => {
        displayIcon(decoration.icon, decoration);
    });

    // Show or hide the clear search button based on input
    const clearSearchButton = document.getElementById('clearSearchButton');
    if (query) {
        clearSearchButton.classList.remove('hidden');
    } else {
        clearSearchButton.classList.add('hidden');
    }
}

// Event listener for search input
document.getElementById('searchInput').addEventListener('input', function() {
    const query = this.value;
    searchDecorations(query);
});

// Event listener for clear search button
document.getElementById('clearSearchButton').addEventListener('click', function() {
    document.getElementById('searchInput').value = '';
    this.classList.add('hidden');
    const categoryId = document.getElementById('categoryDropdown').value;
    displayDecorations(categoryId); // Reset to showing decorations for the selected category
});