import React, { useState } from 'react';
import { Category } from '../types';

interface HeaderProps {
  onSearch: (query: string) => void;
  onCategoryChange: (categoryId: string) => void;
  categories: Category[];
  totalDecorations: number;
  getCategoryCount: (categoryId: number) => number;
}

export const Header: React.FC<HeaderProps> = ({ 
  onSearch, 
  onCategoryChange,
  categories,
  totalDecorations,
  getCategoryCount
}) => {
  const [searchValue, setSearchValue] = useState('');

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchValue(value);
    onSearch(value);
  };

  const handleClearSearch = () => {
    setSearchValue('');
    onSearch('');
  };

  return (
    <div id="header">
      <div>
        <div className="search-container">
          <input 
            type="text" 
            id="searchInput" 
            placeholder="Search decorations..."
            value={searchValue}
            onChange={handleSearchChange}
          />
          {searchValue && (
            <button 
              id="clearSearchButton" 
              className="clear-search"
              onClick={handleClearSearch}
            >
              ❌
            </button>
          )}
        </div>
        <select 
          id="categoryDropdown"
          onChange={(e) => onCategoryChange(e.target.value)}
        >
          <option value="all">All ({totalDecorations})</option>
          {categories.map(category => (
            <option key={category.id} value={category.id}>
              {category.name} ({getCategoryCount(category.id)})
            </option>
          ))}
        </select>
      </div>
      <div>
        Homestead Decorations
      </div>
    </div>
  );
};
