import { useState, useEffect, useRef } from 'react';
import type { Prompt } from './types';
import './App.css';

function App() {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    setPrompts(prompts.filter((p) => p.id !== id));
  };

  const handleFillPrompt = async (prompt: Prompt) => {
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
            className="prompt-item"
            onClick={() => handleFillPrompt(prompt)}
            title={prompt.content}
          >
            <span className="prompt-title">{prompt.title}</span>
            <button
              className="delete-btn"
              onClick={(e) => handleDeletePrompt(prompt.id, e)}
            >
              ×
            </button>
          </div>
        ))}
      </div>

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
