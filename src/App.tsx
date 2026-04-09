import React, { useState } from 'react';
import { Header } from './components/Header';
import { IconGrid } from './components/IconGrid';
import { ChangeLogPanel } from './components/ChangeLogPanel';
import { useDecorations } from './hooks/useDecorations';
import { useChangelog } from './hooks/useChangelog';
import './App.css';

function App() {
  const [isChangelogOpen, setIsChangelogOpen] = useState(false);
  const [selectedChangelogItemId, setSelectedChangelogItemId] = useState<number | null>(null);
  const [pendingOpenAfterFilterResetId, setPendingOpenAfterFilterResetId] = useState<number | null>(null);
  const [changelogScrollTop, setChangelogScrollTop] = useState<number>(0);
  const [filterVisibilityPrompt, setFilterVisibilityPrompt] = useState<{ id: number; name: string } | null>(null);
  const { 
    decorations, 
    allDecorations, 
    categories, 
    setSelectedCategory, 
    setSearchQuery,
    searchQuery,
    selectedCategory,
    loading: decorationsLoading,
    error: decorationsError
  } = useDecorations();
  const { days: changelogDays, loading: changelogLoading } = useChangelog();

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

  const openDecorationById = (id: number) => {
    setSelectedChangelogItemId(null);
    requestAnimationFrame(() => setSelectedChangelogItemId(id));
  };

  const handleChangelogEntryClick = (id: number, fallbackName: string) => {
    const inFilteredList = decorations.some((decoration) => decoration.id === id);
    const inAllItems = allDecorations.some((decoration) => decoration.id === id);

    setIsChangelogOpen(false);

    if (inFilteredList) {
      openDecorationById(id);
      return;
    }

    if (inAllItems) {
      setFilterVisibilityPrompt({ id, name: fallbackName });
    }
  };

  React.useEffect(() => {
    if (pendingOpenAfterFilterResetId == null) {
      return;
    }

    const nowVisible = decorations.some((decoration) => decoration.id === pendingOpenAfterFilterResetId);
    if (!nowVisible) {
      return;
    }

    openDecorationById(pendingOpenAfterFilterResetId);
    setPendingOpenAfterFilterResetId(null);
  }, [pendingOpenAfterFilterResetId, decorations]);

  return (
    <div className="min-h-screen bg-gray-100">
      <Header 
        onSearch={setSearchQuery}
        onCategoryChange={setSelectedCategory}
        onOpenChangelog={() => setIsChangelogOpen(true)}
        searchValue={searchQuery}
        selectedCategory={selectedCategory}
        categories={categories}
        totalDecorations={getFilteredCount()}
        getCategoryTotalCount={(id) => getFilteredCount(id)}
      />

      <main className="container mx-auto px-6">
        {decorationsError && (
          <div className="mt-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            Failed to load decoration data: {decorationsError}
          </div>
        )}
        <IconGrid
          decorations={decorations}
          categories={categories}
          openDecorationId={selectedChangelogItemId}
        />
        {!decorationsLoading && !decorationsError && decorations.length === 0 && (
          <div className="py-10 text-center text-sm text-gray-600">
            No decorations found.
          </div>
        )}
      </main>

      <ChangeLogPanel
        isOpen={isChangelogOpen}
        onClose={() => setIsChangelogOpen(false)}
        onEntryClick={handleChangelogEntryClick}
        days={changelogDays}
        loading={changelogLoading}
        scrollTop={changelogScrollTop}
        onScrollTopSave={setChangelogScrollTop}
      />

      {filterVisibilityPrompt && (
        <div className="fixed bottom-4 right-4 z-[220] bg-white border border-gray-200 shadow-xl rounded-lg p-4 w-[min(90vw,420px)]">
          <p className="text-sm text-gray-800">
            <span className="font-semibold">{filterVisibilityPrompt.name}</span> is currently hidden by Search or Category filters.
            Remove filters to make it visible?
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <button
              className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50"
              onClick={() => setFilterVisibilityPrompt(null)}
            >
              No
            </button>
            <button
              className="px-3 py-1.5 text-sm bg-gray-900 text-white rounded hover:bg-black"
              onClick={() => {
                const targetId = filterVisibilityPrompt.id;
                setFilterVisibilityPrompt(null);
                setSelectedCategory('all');
                setSearchQuery('');
                setPendingOpenAfterFilterResetId(targetId);
              }}
            >
              Yes
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;