import React from 'react';
import { Category } from '../types';
import homesteadIcon from '../assets/homestead.png';

interface HeaderProps {
  onSearch: (query: string) => void;
  onCategoryChange: (categoryId: string) => void;
  onOpenChangelog: () => void;
  searchValue: string;
  selectedCategory: string;
  categories: Category[];
  totalDecorations: number;
  getCategoryTotalCount: (categoryId: number) => number;
}

export const Header: React.FC<HeaderProps> = ({ 
  onSearch, 
  onCategoryChange,
  onOpenChangelog,
  searchValue,
  selectedCategory,
  categories,
  totalDecorations,
  getCategoryTotalCount
}) => {
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    onSearch(value);
  };

  const handleClearSearch = () => {
    onSearch('');
  };

  const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    onCategoryChange(value);
  };

  const handleReset = () => {
    onSearch('');
    onCategoryChange('all');
  };

  return (
    <header className="bg-white shadow-sm sticky top-0 z-50">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex-1" />

          <div className="flex items-center justify-center gap-8">
            <select 
              value={selectedCategory}
              className="w-[200px] h-8 px-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
              onChange={handleCategoryChange}
            >
              <option value="all">All Categories ({totalDecorations})</option>
              {categories.map(category => (
                <option key={category.id} value={category.id}>
                  {category.name} ({getCategoryTotalCount(category.id)})
                </option>
              ))}
            </select>

            <img 
              src={homesteadIcon} 
              alt="Homestead" 
              className="w-8 h-8 cursor-pointer hover:opacity-80 transition-opacity"
              onClick={handleReset}
            />

            <div className="relative w-[200px]">
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

          <div className="flex-1 flex justify-end">
            <button
              onClick={onOpenChangelog}
              className="h-8 px-3 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-50"
            >
              Updates
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
