document.addEventListener('DOMContentLoaded', function() {
    window.decorations = [];  // Make decorations globally accessible
    window.unlockedDecorationIds = new Map();  // Make unlockedDecorationIds globally accessible
    let apiKey = getCookie('apiKey');

    // Function to fetch categories and then decorations


    // Event listener for API Key input
    document.getElementById('apiKeyInput').addEventListener('input', function() {
        handleApiKeyInput(this.value.trim());
    });

    // Event listener for clearing the API Key
    document.getElementById('clearApiKeyButton').addEventListener('click', function() {
        handleApiKeyInput('');
    });

    // Event listener for category dropdown change
    document.getElementById('categoryDropdown').addEventListener('change', function() {
        const selectedCategoryId = this.value;
        const query = document.getElementById('searchInput').value;
        if (query) {
            searchDecorations(query);
        } else {
            const categoryId = this.value;
            displayDecorations(categoryId);
        }
    });

    // Load the categories and decorations when the page loads
    if (apiKey) {
        adjustUIBasedOnApiKey(apiKey);
        handleApiKeyInput(apiKey);
    } else {
        adjustUIBasedOnApiKey('');
    }

    fetchCategoriesAndDecorations();
});

async function fetchCategoriesAndDecorations() {
    try {
        await fetchCategoriesFromFile();
        const decorationsData = await fetchDecorationsFromFile();
        window.decorations = decorationsData;
        updateCategoryDropdown();
        displayDecorations('all');
    } catch (error) {
        console.error("Error fetching categories and decorations:", error);
    }
}

// Function to fetch categories from the local decoration_categories.json file
async function fetchCategoriesFromFile() {
    try {
        const response = await fetch('./decoration_categories.json');
        categories = await response.json();
        categories.sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
        console.error('Error fetching categories from file:', error);
        categories = [];
    }
}

function updateCategoryDropdown() {
    const dropdown = document.getElementById('categoryDropdown');
    dropdown.innerHTML = ''; // Clear existing options

    // Add "All" option
    const allOption = document.createElement('option');
    allOption.value = 'all';
    allOption.textContent = `All (${decorations.length})`;
    dropdown.appendChild(allOption);

    // Add categories with correct counts
    for (const category of categories) {
        const count = decorations.filter(deco => deco.categories && deco.categories.includes(category.id)).length;
        const option = document.createElement('option');
        option.value = category.id;
        option.textContent = `${category.name} (${count})`;
        dropdown.appendChild(option);
    }
}

// Function to fetch decorations from the local decorations.json file
async function fetchDecorationsFromFile() {
    try {
        const response = await fetch('./decorations.json');
        return await response.json();
    } catch (error) {
        console.error('Error fetching decorations from file:', error);
        return [];
    }
}

// Function to validate API Key format and manage its state
function handleApiKeyInput(apiKey) {
    const apiKeyInput = document.getElementById('apiKeyInput');
    const apiKeyStatus = document.getElementById('apiKeyStatus');
    const clearApiKeyButton = document.getElementById('clearApiKeyButton');

    if (apiKey === '') {
        // Clear the cookie and show the API key input field
        deleteCookie('apiKey');
        apiKeyInput.classList.remove('hidden');
        apiKeyInput.classList.remove('border-red', 'border-green');
        apiKeyStatus.classList.add('hidden');
        clearApiKeyButton.classList.add('hidden');
        window.unlockedDecorationIds = new Map();
        reevaluateDecorations();
        return;
    }

    const uuidV4Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const isValid = apiKey.length === 72 && uuidV4Pattern.test(apiKey.substring(0, 36)) && uuidV4Pattern.test(apiKey.substring(36));

    if (isValid) {
        // Set the cookie and show the API key status
        setCookie('apiKey', apiKey, 30);
        apiKeyInput.classList.add('hidden');
        apiKeyStatus.classList.remove('hidden');
        clearApiKeyButton.classList.remove('hidden');
        apiKeyInput.classList.add('border-green');
        fetchUnlockedDecorations(apiKey).then(() => reevaluateDecorations());
    } else {
        // Outline the input in red if the API key is not valid
        apiKeyInput.classList.add('border-red');
        deleteCookie('apiKey');
        window.unlockedDecorationIds = new Map(); // Reset to blank if the API key is removed or invalid
        reevaluateDecorations();
    }
}

// Function to fetch unlocked decorations using the API key
async function fetchUnlockedDecorations(apiKey) {
    try {
        const response = await fetch(`https://api.guildwars2.com/v2/account/homestead/decorations?access_token=${apiKey}`);
        const unlockedDecorations = await response.json();

        // Store the ids of unlocked decorations in a Map for quick lookup
        window.unlockedDecorationIds = new Map(unlockedDecorations.map(deco => [deco.id, deco.count]));

        // Reevaluate and update all items on the page with the unlocked information
        reevaluateDecorations();
    } catch (error) {
        console.error("Failed to fetch unlocked decorations:", error);
    }
}

// Adjust UI elements based on API key state
function adjustUIBasedOnApiKey(apiKey) {
    const apiKeyInput = document.getElementById('apiKeyInput');
    const apiKeyStatus = document.getElementById('apiKeyStatus');
    const clearApiKeyButton = document.getElementById('clearApiKeyButton');

    if (apiKey) {
        apiKeyInput.classList.add('hidden');
        apiKeyStatus.classList.remove('hidden');
        clearApiKeyButton.classList.remove('hidden');
    } else {
        apiKeyInput.classList.remove('hidden');
        apiKeyStatus.classList.add('hidden');
        clearApiKeyButton.classList.add('hidden');
    }
}

// Function to set a cookie
function setCookie(name, value, days) {
    const expires = new Date(Date.now() + days * 86400000).toUTCString();
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/`;
}

// Function to get a cookie
function getCookie(name) {
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
function deleteCookie(name) {
    setCookie(name, "", -1);
}