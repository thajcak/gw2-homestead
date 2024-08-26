let currentHoveredDecoration = null;

// Function to display information in the footer
function updateFooter(decoration) {
	const footer = document.getElementById('footer');
	if (decoration) {
		const isUnlocked = unlockedDecorationIds.has(decoration.id);
		const count = isUnlocked ? unlockedDecorationIds.get(decoration.id) : 0;

		const imgUrl = decoration.icon;
		const name = decoration.name;
		const description = decoration.description || "No description available.";
		const idText = `ID: ${decoration.id}`;
		const categoryNames = decoration.categories.map(id => categories[id]?.name || 'Unknown').join(', ');

		let metaText = `<div>${idText} - ${categoryNames}</div>`;

		if (unlockedDecorationIds.size > 0) {
			metaText += count ? `<div>Count: ${count}</div>` : `<div>Locked</div>`;
		}

		footer.innerHTML = `
			<div class="footer-content">
				<img src="${imgUrl}" class="footer-img">
				<div class="footer-info">
					<div class="footer-name">${name}</div>
					<div class="footer-description">${description}</div>
					<div class="footer-meta">
						${metaText}
					</div>
				</div>
			</div>
		`;
	} else {
		footer.innerHTML = '';
	}
}

// Function to handle hover over a decoration
function handleHoverDecoration(decoration, img) {
	if (currentHoveredDecoration && currentHoveredDecoration.id !== decoration.id) {
		const prevImg = document.querySelector(`.icon[data-id='${currentHoveredDecoration.id}']`);
		if (prevImg) {
			prevImg.classList.remove('orange-border');
			prevImg.classList.add(getBorderClass(currentHoveredDecoration));
		}
	}

	img.classList.add('orange-border');
	img.classList.remove('black', 'blue', 'red', 'unlocked', 'locked');
	currentHoveredDecoration = decoration;
	updateFooter(decoration);
}

// Function to get the border class based on the decoration state
function getBorderClass(decoration) {
	if (unlockedDecorationIds.has(decoration.id)) {
		return 'unlocked';
	} else if (unlockedDecorationIds.size > 0) {
		return 'locked';
	} else {
		return 'black';
	}
}

// Modified displayIcon function to include hover event listener
function displayIcon(iconUrl, decoration) {
	const img = document.createElement('img');
	img.src = iconUrl;
	img.className = `icon ${getBorderClass(decoration)}`;
	img.dataset.id = decoration.id;

	img.addEventListener('mouseover', () => handleHoverDecoration(decoration, img));

	document.getElementById('iconContainer').appendChild(img);
}

// In-memory cache for storing fetched decoration and category data
const decorationCache = {};
const categories = {};
let decorations = [];
let unlockedDecorationIds = new Map();

// Function to fetch categories and then decorations
async function fetchCategoriesAndDecorations() {
	try {
		const categoryResponse = await fetch('https://api.guildwars2.com/v2/homestead/decorations/categories');
		const categoryIds = await categoryResponse.json();

		for (const id of categoryIds) {
			const categoryData = await fetchCategoryById(id);
			categories[id] = categoryData;
			addCategoryToDropdown(categoryData);
		}

		// Fetch decorations after categories are loaded
		fetchDecorations();
	} catch (error) {
		console.error('Error fetching categories or decorations:', error);
	}
}

// Function to fetch a category by ID
async function fetchCategoryById(id) {
	const response = await fetch(`https://api.guildwars2.com/v2/homestead/decorations/categories/${id}`);
	return await response.json();
}

// Function to add category to the dropdown
function addCategoryToDropdown(categoryData) {
	const dropdown = document.getElementById('categoryDropdown');
	const option = document.createElement('option');
	option.value = categoryData.id;
	option.textContent = categoryData.name;
	dropdown.appendChild(option);
}

// Function to fetch decorations and display icons
async function fetchDecorations() {
	try {
		const response = await fetch('https://api.guildwars2.com/v2/homestead/decorations');
		const decorationIds = await response.json();

		decorations = []; // Clear existing decorations list

		for (const id of decorationIds) {
			const decorationData = await fetchDecorationById(id);
			decorationCache[id] = decorationData;
			decorations.push(decorationData);
		}

		// Initially display all decorations
		displayDecorations('all');
	} catch (error) {
		console.error('Error fetching decorations:', error);
	}
}

// Function to fetch a decoration by ID
async function fetchDecorationById(id) {
	const response = await fetch(`https://api.guildwars2.com/v2/homestead/decorations/${id}`);
	return await response.json();
}

// Function to display decorations based on selected category
function displayDecorations(categoryId) {
	const container = document.getElementById('iconContainer');
	container.innerHTML = ''; // Clear existing icons

	const filteredDecorations = categoryId === 'all'
		? decorations
		: decorations.filter(deco => deco.categories && deco.categories.includes(parseInt(categoryId)));

	filteredDecorations.forEach(decoration => {
		displayIcon(decoration.icon, decoration);
	});

	// Update the counter
	updateCounter(filteredDecorations.length, categoryId);
}

// Function to update the counter
function updateCounter(totalCount, categoryId) {
	const counter = document.getElementById('counter');
	const unlockedCount = decorations.filter(deco => unlockedDecorationIds.has(deco.id) &&
		(categoryId === 'all' || deco.categories.includes(parseInt(categoryId)))).length;

	if (unlockedDecorationIds.size > 0) {
		counter.textContent = `${unlockedCount} / ${totalCount}`;
	} else {
		counter.textContent = `Total: ${totalCount}`;
	}
}

// Function to validate API Key format
function isValidApiKey(apiKey) {
	const uuidV4Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
	return apiKey.length === 72 && uuidV4Pattern.test(apiKey.substring(0, 36)) && uuidV4Pattern.test(apiKey.substring(36));
}

// Function to fetch unlocked decorations using API Key
async function fetchUnlockedDecorations(apiKey) {
	if (!isValidApiKey(apiKey)) {
		alert("Invalid API Key format. Please enter a valid key.");
		return;
	}

	try {
		const response = await fetch(`https://api.guildwars2.com/v2/account/homestead/decorations?access_token=${apiKey}`);
		const unlockedDecorations = await response.json();

		// Store the ids of unlocked decorations in a Map for quick lookup
		unlockedDecorationIds = new Map(unlockedDecorations.map(deco => [deco.id, deco.count]));

		// Reevaluate and update all items on the page with the unlocked information
		reevaluateDecorations();
	} catch (error) {
		console.error('Error fetching unlocked decorations:', error);
		alert("Failed to fetch unlocked decorations. Please check your API Key.");
	}
}

// Function to reevaluate and update all items on the page
function reevaluateDecorations() {
	const categoryId = document.getElementById('categoryDropdown').value;
	const filteredDecorations = categoryId === 'all'
		? decorations
		: decorations.filter(deco => deco.categories && deco.categories.includes(parseInt(categoryId)));

	updateCounter(filteredDecorations.length, categoryId);
	displayDecorations(categoryId);
}

// Event listener for category dropdown change
document.getElementById('categoryDropdown').addEventListener('change', function() {
	reevaluateDecorations();
});

// Event listener for API Key input
document.getElementById('apiKeyInput').addEventListener('input', function() {
	const apiKey = this.value.trim();
	if (isValidApiKey(apiKey)) {
		fetchUnlockedDecorations(apiKey);
	} else {
		// Reset to black borders if the API key is removed or invalid
		unlockedDecorationIds = new Map();
		reevaluateDecorations();
	}
});

// Load the categories and decorations when the page loads
window.onload = fetchCategoriesAndDecorations;