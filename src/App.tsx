import React from 'react';
import { Header } from './components/Header';
import { IconGrid } from './components/IconGrid';
import { useDecorations } from './hooks/useDecorations';
import { Decoration } from './types'; // Add this import
import './App.css';

function App() {
  const { decorations, categories, setSelectedCategory, setSearchQuery } = useDecorations();

  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  const handleCategoryChange = (categoryId: string) => {
    setSelectedCategory(categoryId);
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <Header 
        onSearch={handleSearch}
        onCategoryChange={handleCategoryChange}
        categories={categories}
        totalDecorations={decorations.length}
        getCategoryCount={(id) => decorations.filter(d => d.categories.includes(id)).length}
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