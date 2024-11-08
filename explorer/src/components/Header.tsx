import React, { useState } from 'react';
import { Category } from '../types';
import homesteadIcon from '../assets/homestead.png';

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
    <header className="bg-white shadow-sm sticky top-0 z-50">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center gap-4">
          <img 
            src={homesteadIcon} 
            alt="Homestead" 
            className="w-8 h-8"
          />
          
          <select 
            className="h-8 px-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
            onChange={(e) => onCategoryChange(e.target.value)}
          >
            <option value="all">All Categories ({totalDecorations})</option>
            {categories.map(category => (
              <option key={category.id} value={category.id}>
                {category.name} ({getCategoryCount(category.id)})
              </option>
            ))}
          </select>

          <div className="relative max-w-[300px] flex-1">
            <input 
              type="text" 
              placeholder="Search decorations..."
              value={searchValue}
              onChange={handleSearchChange}
              className="w-full h-8 px-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
            />
            {searchValue && (
              <button 
                onClick={handleClearSearch}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                ×
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
