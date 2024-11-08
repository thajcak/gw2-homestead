import { useState, useEffect, useMemo } from 'react';
import { Decoration, Category } from '../types';

export function useDecorations() {
  const [decorations, setDecorations] = useState<Decoration[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Fetch initial data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [decorationsResponse, categoriesResponse] = await Promise.all([
          fetch('/decorations.json'),
          fetch('/decoration_categories.json')
        ]);
        
        if (!decorationsResponse.ok || !categoriesResponse.ok) {
          throw new Error('Failed to fetch data');
        }

        const decorationsData = await decorationsResponse.json();
        const categoriesData = await categoriesResponse.json();
        
        setDecorations(decorationsData);
        setCategories(categoriesData.sort((a: Category, b: Category) => 
          a.name.localeCompare(b.name)
        ));
      } catch (error) {
        console.error('Error fetching data:', error);
      }
    };

    fetchData();
  }, []);

  // Use useMemo to optimize filtering
  const filteredDecorations = useMemo(() => {
    let filtered = decorations;

    // Filter by category
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(deco => 
        deco.categories && deco.categories.includes(parseInt(selectedCategory))
      );
    }

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(deco => {
        const nameMatch = deco.name.toLowerCase().includes(query);
        const descriptionMatch = deco.description?.toLowerCase().includes(query);
        return nameMatch || descriptionMatch;
      });
    }

    // Sort by name
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
  }, [decorations, selectedCategory, searchQuery]);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  const handleCategoryChange = (categoryId: string) => {
    setSelectedCategory(categoryId);
  };

  return {
    decorations: filteredDecorations,
    categories,
    setSelectedCategory: handleCategoryChange,
    setSearchQuery: handleSearch,
    searchQuery,
    selectedCategory
  };
}
