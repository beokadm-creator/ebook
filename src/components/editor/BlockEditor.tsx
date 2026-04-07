import React, { useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  DragStartEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { 
  PencilIcon, 
  TrashIcon, 
  ArrowsUpDownIcon,
  PhotoIcon,
  VideoCameraIcon,
  PlayIcon,
  DocumentTextIcon,
  PlusIcon
} from '@heroicons/react/24/outline';
import { ContentBlock as ContentType } from '@/types/content';
import PropertyPanel from './PropertyPanel';

interface SortableBlockProps {
  block: ContentType;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

const SortableBlock: React.FC<SortableBlockProps> = ({ 
  block, 
  index, 
  isSelected, 
  onSelect,
  onDelete 
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: block.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  };

  const getBlockIcon = () => {
    switch (block.type) {
      case 'heading':
      case 'text':
        return <DocumentTextIcon className="w-5 h-5" />;
      case 'image':
        return <PhotoIcon className="w-5 h-5" />;
      case 'video':
        return <VideoCameraIcon className="w-5 h-5" />;
      case 'ad':
        return <PlayIcon className="w-5 h-5" />;
      default:
        return <DocumentTextIcon className="w-5 h-5" />;
    }
  };

  const getBlockPreview = () => {
    switch (block.type) {
      case 'heading':
        return (
          <div className={`font-bold ${block.content.level === 1 ? 'text-2xl' : block.content.level === 2 ? 'text-xl' : 'text-lg'}`}>
            {block.content.text.ko || block.content.text.en || ''}
          </div>
        );
      case 'text':
        return (
          <div 
            className="text-sm text-gray-600 dark:text-gray-400"
            dangerouslySetInnerHTML={{ __html: (block.content.html.ko || block.content.html.en || '').substring(0, 100) + '...' }}
          />
        );
      case 'image':
        return (
          <div className="flex items-center gap-2">
            <img src={block.content.url} alt="" className="w-16 h-16 object-cover rounded" />
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {block.content.caption?.ko || '이미지'}
            </span>
          </div>
        );
      case 'video':
        return (
          <div className="text-sm text-gray-600 dark:text-gray-400">
            {block.content.platform}: {block.content.videoId}
          </div>
        );
      case 'ad':
        return (
          <div className="text-sm text-gray-600 dark:text-gray-400">
            광고: {block.content.advertiser}
          </div>
        );
      default:
        return <div className="text-sm text-gray-600 dark:text-gray-400">알 수 없는 블록</div>;
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`
        bg-white dark:bg-gray-800 rounded-lg p-4 border-2 mb-3
        ${isSelected ? 'border-blue-600 dark:border-blue-400' : 'border-gray-200 dark:border-gray-700'}
        ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}
      `}
    >
      <div className="flex items-start gap-3">
        {/* 드래그 핸들 */}
        <button
          {...attributes}
          {...listeners}
          className="mt-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        >
          <ArrowsUpDownIcon className="w-5 h-5" />
        </button>

        {/* 블록 아이콘 및 미리보기 */}
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            {getBlockIcon()}
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300 uppercase">
              {block.type}
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              #{index + 1}
            </span>
          </div>
          {getBlockPreview()}
        </div>

        {/* 액션 버튼 */}
        <div className="flex gap-2">
          <button
            onClick={onSelect}
            className="p-2 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            title="편집"
          >
            <PencilIcon className="w-5 h-5" />
          </button>
          <button
            onClick={onDelete}
            className="p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
            title="삭제"
          >
            <TrashIcon className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};

interface BlockEditorProps {
  initialBlocks: ContentType[];
  onSave: (blocks: ContentType[]) => void;
}

const BlockEditor: React.FC<BlockEditorProps> = ({
  initialBlocks,
  onSave
}) => {
  const [blocks, setBlocks] = useState<ContentType[]>(initialBlocks);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setBlocks((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);

        return arrayMove(items, oldIndex, newIndex);
      });
    }

    setActiveId(null);
  };

  const handleSelectBlock = (blockId: string) => {
    setSelectedBlockId(blockId);
  };

  const handleDeleteBlock = (blockId: string) => {
    if (window.confirm('이 블록을 삭제하시겠습니까?')) {
      setBlocks((prev) => prev.filter((block) => block.id !== blockId));
      if (selectedBlockId === blockId) {
        setSelectedBlockId(null);
      }
    }
  };

  const handleAddBlock = () => {
    const newBlock: ContentType = {
      id: `block-${Date.now()}`,
      type: 'text',
      content: { html: { ko: '', en: '' } },
      order: blocks.length
    };
    setBlocks((prev) => [...prev, newBlock]);
    setSelectedBlockId(newBlock.id);
  };

  const handleUpdateBlock = (blockId: string, updates: { content: ContentType['content'] }) => {
    setBlocks((prev) =>
      prev.map((block) =>
        block.id === blockId ? ({ ...block, content: updates.content } as ContentType) : block
      )
    );
  };

  const selectedBlock = blocks.find((block) => block.id === selectedBlockId);

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      {/* 왼쪽: 블록 리스트 */}
      <div className="flex-1 p-6 overflow-y-auto">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              블록 편집기
            </h2>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleAddBlock}
                className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
              >
                <PlusIcon className="w-5 h-5" />
                블록 추가
              </button>
              <button
                type="button"
                onClick={() => onSave(blocks)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors"
              >
                저장하기
              </button>
            </div>
          </div>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={blocks.map((b) => b.id)}
              strategy={verticalListSortingStrategy}
            >
              {blocks.map((block, index) => (
                <SortableBlock
                  key={block.id}
                  block={block}
                  index={index}
                  isSelected={selectedBlockId === block.id}
                  onSelect={() => handleSelectBlock(block.id)}
                  onDelete={() => handleDeleteBlock(block.id)}
                />
              ))}
            </SortableContext>

            <DragOverlay>
              {activeId ? (
                <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border-2 border-blue-600 opacity-50">
                  <div className="flex items-center gap-2">
                    <DocumentTextIcon className="w-5 h-5" />
                    <span className="text-sm font-medium">
                      {blocks.find((b) => b.id === activeId)?.type}
                    </span>
                  </div>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </div>
      </div>

      {/* 오른쪽: 속성 패널 */}
      <div className="w-96 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 p-6 overflow-y-auto">
        {selectedBlock ? (
          <PropertyPanel
            block={selectedBlock}
            onUpdate={(updates) => handleUpdateBlock(selectedBlock.id, updates)}
            onClose={() => setSelectedBlockId(null)}
          />
        ) : (
          <div className="text-center text-gray-500 dark:text-gray-400 mt-20">
            <PencilIcon className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <p>편집할 블록을 선택하세요</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default BlockEditor;