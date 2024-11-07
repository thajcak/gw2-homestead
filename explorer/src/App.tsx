import React, { useState } from 'react';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { IconGrid } from './components/IconGrid';
import { Modal } from './components/Modal';
import { useDecorations } from './hooks/useDecorations';
import { Decoration } from './types';
import './App.css';

function App() {
  const { decorations, categories, setSelectedCategory, setSearchQuery } = useDecorations();
  const [selectedDecoration, setSelectedDecoration] = useState<Decoration>();
  const [modalDecoration, setModalDecoration] = useState<Decoration>();

  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  const handleCategoryChange = (categoryId: string) => {
    setSelectedCategory(categoryId);
  };

  const handleDecorationClick = (decoration: Decoration) => {
    setModalDecoration(decoration); // Open modal
  };

  const handleDecorationHover = (decoration: Decoration) => {
    setSelectedDecoration(decoration); // Update footer
  };

  const handleCloseModal = () => {
    setModalDecoration(undefined);
  };

  // Calculate total decorations
  const totalDecorations = decorations.length;

  // Function to get count of decorations in a category
  const getCategoryCount = (categoryId: number) => {
    return decorations.filter(deco => 
      deco.categories && deco.categories.includes(categoryId)
    ).length;
  };

  return (
    <div className="app-container">
      <Header 
        onSearch={handleSearch}
        onCategoryChange={handleCategoryChange}
        categories={categories}
        totalDecorations={totalDecorations}
        getCategoryCount={getCategoryCount}
      />

      <main className="app-main">
        <IconGrid
          decorations={decorations}
          onDecorationClick={handleDecorationClick}
          onDecorationHover={handleDecorationHover}
        />
      </main>

      <Footer 
        selectedDecoration={selectedDecoration}
        categories={categories}
      />

      <Modal 
        decoration={modalDecoration}
        onClose={handleCloseModal}
      />
    </div>
  );
}

export default App;
