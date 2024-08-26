
// In-memory cache for storing fetched decoration and category data
const decorationCache = {};
const categories = {};
let decorations = [];
let unlockedDecorationIds = new Map();
let apiKey = getCookie('apiKey');

// Function to fetch categories and then decorations
async function fetchCategoriesAndDecorations() {
    const categoryIds = await fetchCategories();

    for (const id of categoryIds) {
        const categoryData = await fetchCategoryById(id);
        categories[id] = categoryData;
    }

    // Fetch decorations after categories are loaded
    await fetchDecorations();

    // Update the category dropdown with accurate counts
    updateCategoryDropdown();
}

// Function to fetch decorations and display icons
async function fetchDecorations() {
    const decorationIds = await fetchDecorationIds();

    decorations = []; // Clear existing decorations list

    for (const id of decorationIds) {
        const decorationData = await fetchDecorationById(id);
        decorationCache[id] = decorationData;
        decorations.push(decorationData);
    }

    // Initially display all decorations
    displayDecorations('all');
}

// Function to validate API Key format and manage its state
function handleApiKeyInput(apiKey) {
    const apiKeyInput = document.getElementById('apiKeyInput');

    if (apiKey === '') {
        // Clear the cookie and remove the red outline
        deleteCookie('apiKey');
        apiKeyInput.style.borderColor = '';
        unlockedDecorationIds = new Map();
        reevaluateDecorations();
        return;
    }

    const uuidV4Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const isValid = apiKey.length === 72 && uuidV4Pattern.test(apiKey.substring(0, 36)) && uuidV4Pattern.test(apiKey.substring(36));

    if (isValid) {
        // Set the cookie and set the border to green
        setCookie('apiKey', apiKey, 30);
        apiKeyInput.style.borderColor = 'green';
        fetchUnlockedDecorations(apiKey).then(() => reevaluateDecorations());
    } else {
        // Outline the input in red if the API key is not valid
        apiKeyInput.style.borderColor = 'red';
        deleteCookie('apiKey');
        unlockedDecorationIds = new Map(); // Reset to black borders if the API key is removed or invalid
        reevaluateDecorations();
    }
}

// Function to fetch unlocked decorations using the API key
async function fetchUnlockedDecorations(apiKey) {
    try {
        const response = await fetch(`https://api.guildwars2.com/v2/account/homestead/decorations?access_token=${apiKey}`);
        const unlockedDecorations = await response.json();

        // Store the ids of unlocked decorations in a Map for quick lookup
        unlockedDecorationIds = new Map(unlockedDecorations.map(deco => [deco.id, deco.count]));

        // Reevaluate and update all items on the page with the unlocked information
        reevaluateDecorations();
    } catch (error) {
        console.error("Failed to fetch unlocked decorations", error);
    }
}

// Event listener for API Key input
document.getElementById('apiKeyInput').addEventListener('input', function() {
    handleApiKeyInput(this.value.trim());
});

// Load the categories and decorations when the page loads
window.onload = function() {
    // Check if an API key is stored in cookies and use it
    if (apiKey) {
        document.getElementById('apiKeyInput').value = apiKey;
        handleApiKeyInput(apiKey);
    }

    fetchCategoriesAndDecorations();
};
