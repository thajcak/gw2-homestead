document.addEventListener('DOMContentLoaded', function() {
    // In-memory cache for storing fetched decoration and category data
    const decorationCache = {};
    window.categories = {};  // Make categories globally accessible
    window.decorations = [];  // Make decorations globally accessible
    window.unlockedDecorationIds = new Map();  // Make unlockedDecorationIds globally accessible
    let apiKey = getCookie('apiKey');

    // Function to fetch categories and then decorations
    async function fetchCategoriesAndDecorations() {
        try {
            const categoryIds = await fetchCategories();

            for (const id of categoryIds) {
                const categoryData = await fetchCategoryById(id);
                window.categories[id] = categoryData;
            }

            // Fetch decorations after categories are loaded
            await fetchDecorations();

            // Update the category dropdown with accurate counts
            updateCategoryDropdown();
        } catch (error) {
            console.error("Error fetching categories and decorations:", error);
        }
    }

    // Function to fetch decorations and display icons
    async function fetchDecorations() {
        try {
            const decorationIds = await fetchDecorationIds();

            window.decorations = []; // Clear existing decorations list

            for (const id of decorationIds) {
                const decorationData = await fetchDecorationById(id);
                decorationCache[id] = decorationData;
                window.decorations.push(decorationData);
            }

            // Initially display all decorations
            displayDecorations('all');
        } catch (error) {
            console.error("Error fetching decorations:", error);
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
            apiKeyInput.style.display = 'block';
            apiKeyInput.style.borderColor = '';
            apiKeyStatus.style.display = 'none';
            clearApiKeyButton.style.display = 'none';
            window.unlockedDecorationIds = new Map();
            reevaluateDecorations();
            return;
        }

        const uuidV4Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const isValid = apiKey.length === 72 && uuidV4Pattern.test(apiKey.substring(0, 36)) && uuidV4Pattern.test(apiKey.substring(36));

        if (isValid) {
            // Set the cookie and show the API key status
            setCookie('apiKey', apiKey, 30);
            apiKeyInput.style.display = 'none';
            apiKeyStatus.style.display = 'inline-block';
            clearApiKeyButton.style.display = 'inline-block';
            apiKeyInput.style.borderColor = 'green';
            fetchUnlockedDecorations(apiKey).then(() => reevaluateDecorations());
        } else {
            // Outline the input in red if the API key is not valid
            apiKeyInput.style.borderColor = 'red';
            deleteCookie('apiKey');
            window.unlockedDecorationIds = new Map(); // Reset to black borders if the API key is removed or invalid
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

    // Event listener for API Key input
    document.getElementById('apiKeyInput').addEventListener('input', function() {
        handleApiKeyInput(this.value.trim());
    });

    // Event listener for clearing the API Key
    document.getElementById('clearApiKeyButton').addEventListener('click', function() {
        handleApiKeyInput('');
    });

    // Load the categories and decorations when the page loads
    if (apiKey) {
        handleApiKeyInput(apiKey);
    } else {
        document.getElementById('apiKeyInput').style.display = 'block';
        document.getElementById('apiKeyStatus').style.display = 'none';
        document.getElementById('clearApiKeyButton').style.display = 'none';
    }

    fetchCategoriesAndDecorations();
});