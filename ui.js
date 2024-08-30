// Set global variables
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
window.handleHoverDecoration = function(decoration, img) {
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
window.handleClickDecoration = function(decoration, img) {
    // updateFooter(decoration);

    // Generate API URL
    const encodedName = encodeURIComponent(decoration.name);
    const titles = `${encodedName}%20(Handiwork)|${encodedName}%20Decoration|${encodedName}`;
    const apiUrl = `https://wiki.guildwars2.com/api.php?action=query&titles=${titles}&prop=pageimages&piprop=original|thumbnail&format=json&origin=*`;

    // Fetch data from the API
    fetch(apiUrl)
        .then(response => response.json())
        .then(data => {
            // Extract the image URLs
            const pages = data.query.pages;
            let imageInfo = null;

            for (const pageId in pages) {
                if (!pageId.startsWith("-")) {
                    const page = pages[pageId];
                    if (page.title.includes("Handiwork")) {
                        imageInfo = page;
                        break;
                    } else if (page.title.includes("Decoration")) {
                        imageInfo = page;
                    } else if (!imageInfo) {
                        imageInfo = page;
                    }
                }
            }
            decoration.wikiTitle = imageInfo.title;

            // Check if imageInfo contains 'original'
            if (imageInfo && imageInfo.original) {
                // Add the image URLs and dimensions to the decoration object
                decoration.thumbnail;
                decoration.original = imageInfo.original;

                // Update the footer with the new image
                updateFooter(decoration);
                showModal(decoration);
            } else {
                // If 'original' is missing, make another API call to fetch RDF data
                const rdfTitle = imageInfo.title.replace(/ /g, '_');
                const rdfApiUrl = `https://corsproxy.io/?${encodeURIComponent("https://wiki.guildwars2.com/index.php?title=Special:ExportRDF/" + rdfTitle)}`;

                fetch(rdfApiUrl)
                    .then(response => response.text())
                    .then(rdfData => {
                        // Parse the XML response
                        const parser = new DOMParser();
                        const xmlDoc = parser.parseFromString(rdfData, "application/xml");

                        // Use getElementsByTagName to find the element with the "property:Has_appearance" tag
                        const appearanceElements = xmlDoc.getElementsByTagName("property:Has_appearance");

                        if (appearanceElements.length > 0) {
                            // Get the "rdf:resource" attribute value from the first matching element
                            const fullFilename = appearanceElements[0].getAttribute("rdf:resource");

                            if (fullFilename) {
                                // Truncate the filename to get only the last part of the path
                                const truncatedFilename = fullFilename.substring(fullFilename.lastIndexOf('/') + 1);

                                // Replace "-3A" with ":"
                                const filenameTitle = encodeURIComponent(truncatedFilename.replace(/-3A/g, ":"));
                                const fallbackApiUrl = `https://wiki.guildwars2.com/api.php?action=query&titles=${filenameTitle}&prop=pageimages&piprop=original|thumbnail&format=json&origin=*`;

                                // Fetch data from the API using the filename
                                fetch(fallbackApiUrl)
                                    .then(response => response.json())
                                    .then(fallbackData => {
                                        const fallbackPages = fallbackData.query.pages;
                                        let fallbackImageInfo = null;
                                        // Loop through pages and find the first non "-1" page
                                        for (const fallbackPageId in fallbackPages) {
                                            if (fallbackPageId !== "-1") {
                                                const fallbackPage = fallbackPages[fallbackPageId];
                                                fallbackImageInfo = fallbackPage;
                                                break;
                                            }
                                        }
                                        if (fallbackImageInfo) {
                                            decoration.original = fallbackImageInfo.original;
                                            decoration.thumbnail = fallbackImageInfo.thumbnail;
                                        } else {
                                            console.error('No original image found using filename.');
                                        }
                                    })
                                    .catch(error => console.error('Error fetching image using filename:', error));
                            } else {
                                console.error('No valid filename found in RDF response.');
                            }
                        } else {
                            console.error('No Has_appearance element found in RDF response.');
                        }
                    })
                .catch(error => console.error('Error fetching RDF data:', error))
                .finally(() => {
                    // Update the footer with the new image
                    updateFooter(decoration);
                    showModal(decoration);
                });
            }
        })
        .catch(error => console.error('Error fetching image:', error));
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
    img.addEventListener('click', () => handleClickDecoration(decoration, img));

    document.getElementById('iconContainer').appendChild(img);
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