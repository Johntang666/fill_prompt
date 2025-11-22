import { useState, useEffect } from 'react';
import type { Prompt } from './types';
import './App.css';

function App() {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [isAdding, setIsAdding] = useState(false);

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

  return (
    <div className="container">
      <h1>Quick Prompts</h1>
      
      <div className="prompt-list">
        {prompts.length === 0 && <p className="no-prompts">No prompts added yet.</p>}
        {prompts.map((prompt) => (
          <div 
            key={prompt.id} 
            className="prompt-item" 
            onClick={() => handleFillPrompt(prompt)}
            title="Click to fill in active tab"
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
