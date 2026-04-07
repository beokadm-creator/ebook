import { useState, useCallback, useRef } from 'react';
import { HighlightMenu } from './BookmarkHighlight';
import { Highlight } from '@/stores/personalizationStore';

interface UseTextHighlightProps {
  onHighlight?: (text: string, color: Highlight['color']) => void;
}

export const useTextHighlight = ({ onHighlight }: UseTextHighlightProps = {}) => {
  const [showMenu, setShowMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const [selectedText, setSelectedText] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const handleTextSelection = useCallback(() => {
    const selection = window.getSelection();
    const text = selection?.toString().trim();

    if (text && text.length > 0) {
      const range = selection?.getRangeAt(0);
      if (range) {
        const rect = range.getBoundingClientRect();
        setMenuPosition({
          x: rect.left + rect.width / 2,
          y: rect.top,
        });
        setSelectedText(text);
        setShowMenu(true);
      }
    } else {
      setShowMenu(false);
    }
  }, []);

  const handleHighlight = useCallback((color: Highlight['color']) => {
    if (selectedText) {
      onHighlight?.(selectedText, color);
      setShowMenu(false);
      
      // 선택 해제
      const selection = window.getSelection();
      selection?.removeAllRanges();
    }
  }, [selectedText, onHighlight]);

  const handleCloseMenu = useCallback(() => {
    setShowMenu(false);
  }, []);

  return {
    containerRef,
    showMenu,
    menuPosition,
    HighlightMenuComponent: showMenu ? (
      <HighlightMenu
        position={menuPosition}
        onHighlight={handleHighlight}
        onClose={handleCloseMenu}
      />
    ) : null,
    textSelectionProps: {
      onMouseUp: handleTextSelection,
      onTouchEnd: handleTextSelection,
    },
  };
};