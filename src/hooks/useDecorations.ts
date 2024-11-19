import { useState, useEffect, useMemo } from 'react';
import { Decoration, Category } from '../types';

export function useDecorations() {
  const [allDecorations, setAllDecorations] = useState<Decoration[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Fetch initial data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const baseUrl = process.env.PUBLIC_URL || '';
        const [decorationsResponse, categoriesResponse] = await Promise.all([
          fetch(`${baseUrl}/decorations.json`),
          fetch(`${baseUrl}/decoration_categories.json`)
        ]);
        
        if (!decorationsResponse.ok || !categoriesResponse.ok) {
          throw new Error('Failed to fetch data');
        }

        const decorationsData = await decorationsResponse.json();
        const categoriesData = await categoriesResponse.json();
        
        setAllDecorations(decorationsData);
        setCategories(categoriesData.sort((a: Category, b: Category) => 
          a.name.localeCompare(b.name)
        ));
      } catch (error) {
        console.error('Error fetching data:', error);
      }
    };

    fetchData();
  }, []);

  // First, filter by search query only
  const searchFilteredDecorations = useMemo(() => {
    if (!searchQuery) return allDecorations;
    
    const query = searchQuery.toLowerCase();
    return allDecorations.filter(deco => {
      const nameMatch = deco.name.toLowerCase().includes(query);
      const descriptionMatch = deco.description?.toLowerCase().includes(query);
      return nameMatch || descriptionMatch;
    });
  }, [allDecorations, searchQuery]);

  // Then apply category filter to the search results
  const filteredDecorations = useMemo(() => {
    let filtered = searchFilteredDecorations;

    // Filter by category
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(deco => 
        deco.categories && deco.categories.includes(parseInt(selectedCategory))
      );
    }

    // Sort by name
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
  }, [searchFilteredDecorations, selectedCategory]);

  // Calculate counts based on search-filtered items
  const getCategoryTotalCount = (categoryId: number) => {
    return searchFilteredDecorations.filter(deco => 
      deco.categories && deco.categories.includes(categoryId)
    ).length;
  };

  return {
    decorations: filteredDecorations,
    allDecorations,
    categories,
    setSelectedCategory,
    setSearchQuery,
    searchQuery,
    selectedCategory,
    getCategoryTotalCount,
    totalDecorations: searchFilteredDecorations.length
  };
}
