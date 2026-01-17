import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Prompt } from './types';
import './App.css';

type TooltipState = {
  isOpen: boolean;
  text: string;
  anchorRect: DOMRect | null;
};

function PromptPreviewTooltip({
  tooltip,
  onHoveredChange,
  onRequestClose,
}: {
  tooltip: TooltipState;
  onHoveredChange: (hovered: boolean) => void;
  onRequestClose: () => void;
}) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({});

  useLayoutEffect(() => {
    if (!tooltip.isOpen || !tooltip.anchorRect || !tooltipRef.current) return;

    const margin = 8;
    const offset = 10;
    const rect = tooltip.anchorRect;
    const tipRect = tooltipRef.current.getBoundingClientRect();

    let left = rect.left;
    let top = rect.bottom + offset;

    if (left + tipRect.width + margin > window.innerWidth) {
      left = Math.max(margin, window.innerWidth - tipRect.width - margin);
    }

    if (top + tipRect.height + margin > window.innerHeight) {
      top = rect.top - tipRect.height - offset;
    }

    top = Math.max(margin, Math.min(top, window.innerHeight - tipRect.height - margin));

    setStyle({ left, top });
  }, [tooltip.isOpen, tooltip.text, tooltip.anchorRect]);

  if (!tooltip.isOpen || !tooltip.anchorRect) return null;

  return createPortal(
    <div
      ref={tooltipRef}
      className="prompt-tooltip"
      style={style}
      role="tooltip"
      onMouseEnter={() => onHoveredChange(true)}
      onMouseLeave={() => {
        onHoveredChange(false);
        onRequestClose();
      }}
    >
      <div className="prompt-tooltip-content">{tooltip.text}</div>
    </div>,
    document.body
  );
}

function App() {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState>({
    isOpen: false,
    text: '',
    anchorRect: null,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isTooltipHoveredRef = useRef(false);
  const draggingIdRef = useRef<string | null>(null);
  const lastDragOverIdRef = useRef<string | null>(null);
  const suppressNextClickRef = useRef(false);
  const hideTooltipTimerRef = useRef<number | null>(null);

  // Load prompts from storage on mount
  useEffect(() => {
    if (chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['prompts'], (result) => {
        if (result.prompts) {
          setPrompts(result.prompts as Prompt[]);
        }
      });
    } else {
      // Fallback for development without extension context
      console.warn("Chrome storage not available, using mock data");
    }
  }, []);

  // Save prompts to storage whenever they change
  useEffect(() => {
    if (chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ prompts });
    }
  }, [prompts]);

  const setTooltipHovered = (hovered: boolean) => {
    isTooltipHoveredRef.current = hovered;
  };

  const hideTooltip = () => {
    setTooltip({ isOpen: false, text: '', anchorRect: null });
  };

  const scheduleHideTooltip = () => {
    if (hideTooltipTimerRef.current) window.clearTimeout(hideTooltipTimerRef.current);
    hideTooltipTimerRef.current = window.setTimeout(() => {
      if (!isTooltipHoveredRef.current) hideTooltip();
    }, 80);
  };

  const handleAddPrompt = () => {
    if (!newTitle.trim() || !newContent.trim()) return;

    const newPrompt: Prompt = {
      id: crypto.randomUUID(),
      title: newTitle,
      content: newContent,
    };

    setPrompts([...prompts, newPrompt]);
    setNewTitle('');
    setNewContent('');
    setIsAdding(false);
  };

  const handleDeletePrompt = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    hideTooltip();
    setPrompts(prompts.filter((p) => p.id !== id));
  };

  const handleFillPrompt = async (prompt: Prompt) => {
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      return;
    }
    if (!chrome.tabs) {
      console.warn("Chrome tabs API not available");
      return;
    }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, { type: 'FILL_PROMPT', prompt });
      // Optional: Close popup after filling
      // window.close(); 
    }
  };

  // Export prompts to Markdown file
  const handleExport = () => {
    if (prompts.length === 0) {
      alert('没有可导出的提示词');
      return;
    }

    // Convert prompts to Markdown format
    // Use a robust format that won't conflict with Markdown content in prompts
    let markdown = '# Quick Prompts Export\n\n';
    markdown += '<!-- Format: Each prompt starts with TITLE: followed by CONTENT: -->\n\n';

    prompts.forEach((prompt, index) => {
      markdown += `**TITLE:** ${prompt.title}\n\n`;
      markdown += `**CONTENT:**\n${prompt.content}\n\n`;
      if (index < prompts.length - 1) {
        markdown += '---\n\n';
      }
    });

    // Create blob and download
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `quick-prompts-export-${new Date().toISOString().split('T')[0]}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Import prompts from Markdown file
  const handleImport = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (!content) return;

      try {
        const importedPrompts = parseMarkdownToPrompts(content);
        if (importedPrompts.length === 0) {
          alert('未能从文件中解析出任何提示词');
          return;
        }

        // Merge with existing prompts
        const confirmMsg = `将导入 ${importedPrompts.length} 个提示词。\n现有 ${prompts.length} 个提示词将保留。\n\n是否继续？`;
        if (confirm(confirmMsg)) {
          setPrompts([...prompts, ...importedPrompts]);
          alert(`成功导入 ${importedPrompts.length} 个提示词！`);
        }
      } catch (error) {
        console.error('Import error:', error);
        alert('导入失败：文件格式不正确');
      }
    };
    reader.readAsText(file);

    // Reset file input
    e.target.value = '';
  };

  const openEditPrompt = (prompt: Prompt, e: React.MouseEvent) => {
    e.stopPropagation();
    hideTooltip();
    setEditingId(prompt.id);
    setEditTitle(prompt.title);
    setEditContent(prompt.content);
  };

  const saveEditPrompt = () => {
    if (!editingId) return;
    if (!editTitle.trim() || !editContent.trim()) return;

    setPrompts((prev) =>
      prev.map((p) =>
        p.id === editingId ? { ...p, title: editTitle.trim(), content: editContent } : p
      )
    );
    setEditingId(null);
  };

  const cancelEditPrompt = () => {
    setEditingId(null);
  };

  const movePrompt = (items: Prompt[], activeId: string, overId: string) => {
    const fromIndex = items.findIndex((p) => p.id === activeId);
    const toIndex = items.findIndex((p) => p.id === overId);
    if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return items;

    const next = items.slice();
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    return next;
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
    hideTooltip();
    suppressNextClickRef.current = true;
    draggingIdRef.current = id;
    lastDragOverIdRef.current = null;
    setDraggingId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  };

  const handleDragOver = (e: React.DragEvent, overId: string) => {
    e.preventDefault();
    const activeId = draggingIdRef.current;
    if (!activeId || activeId === overId) return;
    if (lastDragOverIdRef.current === overId) return;

    lastDragOverIdRef.current = overId;
    setPrompts((prev) => movePrompt(prev, activeId, overId));
  };

  const handleDragEnd = () => {
    draggingIdRef.current = null;
    lastDragOverIdRef.current = null;
    setDraggingId(null);
    window.setTimeout(() => {
      suppressNextClickRef.current = false;
    }, 150);
  };

  const handlePromptMouseEnter = (prompt: Prompt, e: React.MouseEvent<HTMLDivElement>) => {
    if (draggingIdRef.current || editingId) return;
    if (hideTooltipTimerRef.current) window.clearTimeout(hideTooltipTimerRef.current);

    const anchorRect = e.currentTarget.getBoundingClientRect();
    setTooltip({ isOpen: true, text: prompt.content, anchorRect });
  };

  const handlePromptMouseLeave = () => {
    scheduleHideTooltip();
  };

  // Parse Markdown content to Prompt array
  const parseMarkdownToPrompts = (markdown: string): Prompt[] => {
    const prompts: Prompt[] = [];

    // Split by --- separator
    const sections = markdown.split(/^---$/m).filter(s => s.trim());

    sections.forEach(section => {
      // Skip the header section
      if (section.includes('Quick Prompts Export') || section.includes('<!-- Format:')) {
        // Try to extract prompts from this section too
        const cleanSection = section.replace(/# Quick Prompts Export/g, '').replace(/<!-- Format:.*?-->/gs, '').trim();
        if (!cleanSection) return;
        section = cleanSection;
      }

      // Match TITLE: and CONTENT: markers
      const titleMatch = section.match(/\*\*TITLE:\*\*\s*(.+?)(?=\n|$)/s);
      const contentMatch = section.match(/\*\*CONTENT:\*\*\s*\n([\s\S]*?)$/s);

      if (titleMatch && contentMatch) {
        const title = titleMatch[1].trim();
        const content = contentMatch[1].trim();

        if (title && content) {
          prompts.push({
            id: crypto.randomUUID(),
            title,
            content,
          });
        }
      }
    });

    return prompts;
  };

  return (
    <div className="container">
      <PromptPreviewTooltip
        tooltip={tooltip}
        onHoveredChange={setTooltipHovered}
        onRequestClose={scheduleHideTooltip}
      />
      <div className="header">
        <h1>Quick Prompts</h1>
        <div className="header-actions">
          <button className="icon-btn" onClick={handleExport} title="导出提示词">
            ⬇️ 导出
          </button>
          <button className="icon-btn" onClick={handleImport} title="导入提示词">
            ⬆️ 导入
          </button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".md,.markdown,.txt"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      <div className="prompt-list">
        {prompts.length === 0 && <p className="no-prompts">No prompts added yet.</p>}
        {prompts.map((prompt) => (
          <div
            key={prompt.id}
            className={`prompt-item${draggingId === prompt.id ? ' is-dragging' : ''}`}
            onClick={() => handleFillPrompt(prompt)}
            onMouseEnter={(e) => handlePromptMouseEnter(prompt, e)}
            onMouseLeave={handlePromptMouseLeave}
            onDragOver={(e) => handleDragOver(e, prompt.id)}
            onDrop={(e) => {
              e.preventDefault();
              handleDragEnd();
            }}
          >
            <span
              className="drag-handle"
              title="拖拽移动"
              draggable
              onDragStart={(e) => handleDragStart(e, prompt.id)}
              onDragEnd={handleDragEnd}
              onClick={(e) => e.stopPropagation()}
            >
              ⋮⋮
            </span>
            <span className="prompt-title">{prompt.title}</span>
            <div className="prompt-actions">
              <button className="edit-btn" onClick={(e) => openEditPrompt(prompt, e)} title="编辑">
                ✎
              </button>
              <button
                className="delete-btn"
                onClick={(e) => handleDeletePrompt(prompt.id, e)}
                title="删除"
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>

      {editingId && (
        <div className="modal-overlay" onClick={cancelEditPrompt}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">编辑提示词</h2>
            <input
              type="text"
              placeholder="Title"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
            />
            <textarea
              placeholder="Prompt content..."
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
            />
            <div className="form-actions">
              <button onClick={saveEditPrompt}>Save</button>
              <button onClick={cancelEditPrompt} className="cancel-btn">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {isAdding ? (
        <div className="add-form">
          <input
            type="text"
            placeholder="Title (e.g., 'Summarize')"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
          />
          <textarea
            placeholder="Prompt content..."
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
          />
          <div className="form-actions">
            <button onClick={handleAddPrompt}>Save</button>
            <button onClick={() => setIsAdding(false)} className="cancel-btn">Cancel</button>
          </div>
        </div>
      ) : (
        <button className="add-btn" onClick={() => setIsAdding(true)}>
          + Add New Prompt
        </button>
      )}
    </div>
  );
}

export default App;
