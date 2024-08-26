// Function to fetch categories
window.fetchCategories = async function () {
	try {
		const response = await fetch('https://api.guildwars2.com/v2/homestead/decorations/categories');
		return await response.json();
	} catch (error) {
		console.error('Error fetching categories:', error);
		return [];
	}
};

// Function to fetch a category by ID
window.fetchCategoryById = async function (id) {
	try {
		const response = await fetch(`https://api.guildwars2.com/v2/homestead/decorations/categories/${id}`);
		return await response.json();
	} catch (error) {
		console.error(`Error fetching category with ID ${id}:`, error);
		return null;
	}
};

// Function to fetch all decoration IDs
window.fetchDecorationIds = async function () {
	try {
		const response = await fetch('https://api.guildwars2.com/v2/homestead/decorations');
		return await response.json();
	} catch (error) {
		console.error('Error fetching decoration IDs:', error);
		return [];
	}
};

// Function to fetch a decoration by ID
window.fetchDecorationById = async function (id) {
	try {
		const response = await fetch(`https://api.guildwars2.com/v2/homestead/decorations/${id}`);
		return await response.json();
	} catch (error) {
		console.error(`Error fetching decoration with ID ${id}:`, error);
		return null;
	}
};

// Function to fetch unlocked decorations using API Key
window.fetchUnlockedDecorations = async function (apiKey) {
	try {
		const response = await fetch(`https://api.guildwars2.com/v2/account/homestead/decorations?access_token=${apiKey}`);
		return await response.json();
	} catch (error) {
		console.error('Error fetching unlocked decorations:', error);
		return [];
	}
};