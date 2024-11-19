import React from 'react';
import { Header } from './components/Header';
import { IconGrid } from './components/IconGrid';
import { useDecorations } from './hooks/useDecorations';
import './App.css';

function App() {
  const { 
    decorations, 
    allDecorations, 
    categories, 
    setSelectedCategory, 
    setSearchQuery,
    searchQuery 
  } = useDecorations();

  const getFilteredCount = (categoryId?: number) => {
    return allDecorations.filter(deco => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const nameMatch = deco.name.toLowerCase().includes(query);
        const descriptionMatch = deco.description?.toLowerCase().includes(query);
        if (!nameMatch && !descriptionMatch) return false;
      }
      
      if (categoryId !== undefined) {
        return deco.categories && deco.categories.includes(categoryId);
      }
      
      return true;
    }).length;
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <Header 
        onSearch={setSearchQuery}
        onCategoryChange={setSelectedCategory}
        categories={categories}
        totalDecorations={getFilteredCount()}
        getCategoryTotalCount={(id) => getFilteredCount(id)}
      />

      <main className="container mx-auto px-6">
        <IconGrid
          decorations={decorations}
          categories={categories}
        />
      </main>
    </div>
  );
}

export default App;