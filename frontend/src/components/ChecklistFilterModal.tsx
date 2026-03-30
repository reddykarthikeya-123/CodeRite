import { useState, useEffect, useMemo } from 'react';
import { X, Check, Minus, Search, Filter } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ChecklistFilterItem } from '../api';

interface ChecklistFilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (selectedChecks: string[]) => void;
  checklistItems: ChecklistFilterItem[];
  categoryName: string;
}

export const ChecklistFilterModal: React.FC<ChecklistFilterModalProps> = ({
  isOpen,
  onClose,
  onApply,
  checklistItems,
  categoryName,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedChecks, setSelectedChecks] = useState<Set<string>>(new Set());
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  const getCheckId = (item: ChecklistFilterItem, fallbackIndex = 0) =>
    item.id || String(item.index ?? fallbackIndex);

  const groupedItems = useMemo(() => checklistItems.reduce((acc, item) => {
    const section = item.section || 'General';
    if (!acc[section]) {
      acc[section] = [];
    }
    acc[section].push(item);
    return acc;
  }, {} as Record<string, ChecklistFilterItem[]>), [checklistItems]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const allCheckIds = new Set<string>();
    checklistItems.forEach((item, index) => {
      if (item.checklist_item) {
        allCheckIds.add(getCheckId(item, index));
      }
    });
    setSelectedChecks(allCheckIds);
    setExpandedSections(new Set(Object.keys(groupedItems)));
  }, [isOpen, checklistItems, groupedItems]);

  const filteredSections = useMemo(() => {
    if (!searchTerm.trim()) {
      return groupedItems;
    }

    const filtered: Record<string, ChecklistFilterItem[]> = {};
    const term = searchTerm.toLowerCase();

    Object.entries(groupedItems).forEach(([section, items]) => {
      const matchingItems = items.filter((item) => {
        const checkText = (item.checklist_item || '').toLowerCase();
        const sectionName = (item.section || '').toLowerCase();
        return checkText.includes(term) || sectionName.includes(term);
      });

      if (matchingItems.length > 0) {
        filtered[section] = matchingItems;
      }
    });

    return filtered;
  }, [groupedItems, searchTerm]);

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  const toggleCheck = (checkId: string) => {
    setSelectedChecks((prev) => {
      const next = new Set(prev);
      if (next.has(checkId)) {
        next.delete(checkId);
      } else {
        next.add(checkId);
      }
      return next;
    });
  };

  const selectAll = () => {
    const allCheckIds = new Set<string>();
    Object.values(filteredSections).forEach((items) => {
      items.forEach((item, index) => allCheckIds.add(getCheckId(item, index)));
    });
    setSelectedChecks(allCheckIds);
  };

  const deselectAll = () => {
    setSelectedChecks(new Set());
  };

  const handleApply = () => {
    onApply(Array.from(selectedChecks));
    onClose();
  };

  const totalChecks = Object.values(filteredSections).reduce(
    (sum, items) => sum + items.length,
    0
  );
  const selectedCount = selectedChecks.size;

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 20 }}
          transition={{ type: "spring", duration: 0.3 }}
          className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between p-6 border-b border-slate-200 bg-gradient-to-r from-[#1E40AF]/5 to-[#3B82F6]/5">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-[#1E40AF]/10 rounded-lg">
                <Filter className="w-5 h-5 text-[#1E40AF]" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900">Filter Checklist Items</h2>
                <p className="text-sm text-slate-600 mt-0.5">{categoryName}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              aria-label="Close modal"
            >
              <X className="w-5 h-5 text-slate-500" />
            </button>
          </div>

          <div className="p-4 border-b border-slate-200 bg-white">
            <div className="flex items-center gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search checklist items..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#3B82F6]/20 focus:border-[#3B82F6] outline-none text-sm transition-all"
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={selectAll}
                  className="px-3 py-2 text-sm font-medium text-[#1E40AF] bg-[#1E40AF]/5 hover:bg-[#1E40AF]/10 rounded-lg transition-colors"
                >
                  Select All
                </button>
                <button
                  onClick={deselectAll}
                  className="px-3 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  Deselect All
                </button>
              </div>

              <div className="px-4 py-2 bg-[#3B82F6]/10 rounded-lg">
                <span className="text-sm font-bold text-[#1E40AF]">
                  {selectedCount} / {totalChecks}
                </span>
                <span className="text-xs text-slate-600 ml-1">selected</span>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 bg-slate-50">
            <div className="space-y-3">
              {Object.entries(filteredSections).map(([section, items]) => {
                const isExpanded = expandedSections.has(section);
                const sectionChecks = items.map((item, index) => getCheckId(item, index));
                const selectedInSection = sectionChecks.filter((id) => selectedChecks.has(id)).length;
                const allSelected = sectionChecks.length > 0 && selectedInSection === sectionChecks.length;
                const someSelected = selectedInSection > 0 && selectedInSection < sectionChecks.length;

                return (
                  <div
                    key={section}
                    className="bg-white rounded-xl border border-slate-200 overflow-hidden"
                  >
                    <button
                      onClick={() => toggleSection(section)}
                      className="w-full px-4 py-3 flex items-center justify-between bg-gradient-to-r from-slate-50 to-white hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-5 h-5 rounded flex items-center justify-center border transition-colors ${
                            allSelected
                              ? 'bg-[#1E40AF] border-[#1E40AF]'
                              : someSelected
                              ? 'bg-[#3B82F6] border-[#3B82F6]'
                              : 'bg-white border-slate-300'
                          }`}
                          onClick={(e) => {
                            e.stopPropagation();
                            const newSelectedChecks = new Set(selectedChecks);
                            if (allSelected) {
                              sectionChecks.forEach((id) => newSelectedChecks.delete(id));
                            } else {
                              sectionChecks.forEach((id) => newSelectedChecks.add(id));
                            }
                            setSelectedChecks(newSelectedChecks);
                          }}
                        >
                          {allSelected && <Check className="w-3.5 h-3.5 text-white" />}
                          {someSelected && <Minus className="w-3.5 h-3.5 text-white" />}
                        </div>
                        <span className="font-semibold text-slate-800">{section}</span>
                        <span className="text-xs text-slate-500">
                          ({selectedInSection}/{sectionChecks.length})
                        </span>
                      </div>
                      <motion.div
                        animate={{ rotate: isExpanded ? 180 : 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <svg
                          className="w-5 h-5 text-slate-400"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </motion.div>
                    </button>

                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="p-4 space-y-2 border-t border-slate-100">
                            {items.map((item, index) => {
                              const checkId = getCheckId(item, index);
                              const isSelected = selectedChecks.has(checkId);

                              return (
                                <motion.div
                                  key={checkId}
                                  initial={{ opacity: 0, x: -10 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  transition={{ delay: index * 0.02 }}
                                  className={`flex items-start gap-3 p-3 rounded-lg transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#1E40AF] focus:ring-opacity-50 ${
                                    isSelected
                                      ? 'bg-[#1E40AF]/5 hover:bg-[#1E40AF]/10'
                                      : 'bg-slate-50 hover:bg-slate-100'
                                  }`}
                                  onClick={() => toggleCheck(checkId)}
                                  role="checkbox"
                                  aria-checked={isSelected}
                                  tabIndex={0}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault();
                                      toggleCheck(checkId);
                                    }
                                  }}
                                >
                                  <div
                                    className={`w-5 h-5 rounded flex-shrink-0 flex items-center justify-center border transition-colors mt-0.5 ${
                                      isSelected
                                        ? 'bg-[#1E40AF] border-[#1E40AF]'
                                        : 'bg-white border-slate-300'
                                    }`}
                                  >
                                    {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                                  </div>
                                  <span
                                    className={`text-sm flex-1 ${
                                      isSelected ? 'text-slate-800' : 'text-slate-500'
                                    }`}
                                  >
                                    {item.checklist_item}
                                  </span>
                                </motion.div>
                              );
                            })}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}

              {Object.keys(filteredSections).length === 0 && (
                <div className="text-center py-12">
                  <Filter className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-500 font-medium">No checklist items found</p>
                  <p className="text-sm text-slate-400 mt-1">Try adjusting your search term</p>
                </div>
              )}
            </div>
          </div>

          <div className="p-4 border-t border-slate-200 bg-white flex items-center justify-between">
            <p className="text-sm text-slate-600">
              {selectedCount === 0 ? (
                <span className="text-amber-600 font-medium">No checks selected. At least one check should be enabled.</span>
              ) : selectedCount === totalChecks ? (
                <span className="text-[#1E40AF] font-medium">All checks enabled</span>
              ) : (
                <span>{totalChecks - selectedCount} checks will be skipped</span>
              )}
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="px-5 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleApply}
                disabled={selectedCount === 0}
                className={`px-5 py-2.5 text-sm font-bold text-white rounded-lg transition-all ${
                  selectedCount === 0
                    ? 'bg-slate-300 cursor-not-allowed'
                    : 'bg-gradient-to-r from-[#1E3A8A] to-[#3B82F6] hover:shadow-lg hover:shadow-[#3B82F6]/30'
                }`}
              >
                Apply Filters & Upload
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
